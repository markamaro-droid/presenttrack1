// Deno-only helpers shared by the edge functions (CORS, JWT auth, rate limit, OpenAI fetch).
// Never logs or returns secrets or upstream response bodies.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response(null, { status: 204, headers: corsHeaders }) : null;
}

// deno-lint-ignore no-explicit-any
export type Admin = any;

export function serviceClient(): Admin {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Identity comes ONLY from the verified JWT.
export async function authenticate(req: Request): Promise<{ userId: string; admin: Admin } | Response> {
  const header = req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return json({ error: "unauthorized", message: "Please sign in again." }, 401);
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(m[1]);
  if (error || !data?.user?.id) return json({ error: "unauthorized", message: "Please sign in again." }, 401);
  return { userId: data.user.id, admin: serviceClient() };
}

// Returns true when the call is allowed (and records it).
export async function takeRateSlot(admin: Admin, userId: string, kind: string, max: number): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error } = await admin.from("ai_usage").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("kind", kind).gte("created_at", since);
  if (error) return false; // fail closed
  if ((count ?? 0) >= max) return false;
  const ins = await admin.from("ai_usage").insert({ user_id: userId, kind });
  return !ins.error;
}

// Fetch against OpenAI with a hard timeout. Throws a generic Error (no upstream body).
export async function openaiFetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("upstream_unavailable");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.openai.com/v1/${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`upstream_status_${res.status}`);
    return res;
  } catch (e) {
    const msg = e instanceof Error && e.message.startsWith("upstream_status_") ? e.message : "upstream_failed";
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }
}

// Chat completion with strict JSON schema; returns the parsed object.
export async function chatJson(
  messages: unknown[],
  schema: unknown,
  timeoutMs: number,
  temperature: number,
): Promise<unknown> {
  const res = await openaiFetch("chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      temperature,
      messages,
      response_format: { type: "json_schema", json_schema: schema },
    }),
  }, timeoutMs);
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("bad_upstream_shape");
  return JSON.parse(content);
}
