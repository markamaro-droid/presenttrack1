// POST JSON { action: 'ensure' | 'start' | 'status' | 'remove' }
import PptxGenJS from "npm:pptxgenjs@3.12.0";
import { authenticate, chatJson, json, preflight, takeRateSlot, type Admin } from "../_shared/edge.ts";
import { buildDeck, validateDeckContent } from "../_shared/deck.js";
import { DECK_SCHEMA, deckMessages, pickTopic } from "../_shared/prompts.js";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const FILE_NAME = "Initial Presentation Assessment.pptx";
const COLS = "id,status,title,slides,guidelines,file_path,file_name,results,classification,quality,error,completed_at";
const MAX_GENERATIONS_PER_HOUR = 5;

async function getRow(admin: Admin, userId: string) {
  const { data } = await admin.from("initial_assessments").select(COLS).eq("user_id", userId).maybeSingle();
  return data ?? null;
}
async function getCompleted(admin: Admin, userId: string): Promise<boolean> {
  const { data } = await admin.from("user_data").select("initial_assessment_completed").eq("user_id", userId).maybeSingle();
  return data?.initial_assessment_completed === true;
}
async function reply(admin: Admin, userId: string, forceRequired?: boolean, status = 200) {
  const [assessment, completed] = await Promise.all([getRow(admin, userId), getCompleted(admin, userId)]);
  return json({
    required: forceRequired ?? !completed,
    assessment,
    userState: { initial_assessment_completed: completed },
  }, status);
}

async function generate(admin: Admin, userId: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  const topic = pickTopic();
  let content: unknown = null;
  for (let attempt = 0; attempt < 2 && !content; attempt++) {
    if (attempt > 0 && Date.now() > deadline - 65_000) break;
    try {
      const raw = await chatJson(deckMessages(topic), DECK_SCHEMA, 60_000, 0.7);
      const v = validateDeckContent(raw);
      if (v.ok) content = v.content;
    } catch (_e) { /* retry once, then fail generically */ }
  }
  if (!content) throw new Error("invalid_deck");

  // deno-lint-ignore no-explicit-any
  const c = content as any;
  const pres = buildDeck(PptxGenJS, c);
  const bytes = (await pres.write({ outputType: "uint8array" })) as Uint8Array;
  const path = `${userId}/assessment/assessment.pptx`;
  const up = await admin.storage.from("presentations").upload(path, bytes, { contentType: PPTX_MIME, upsert: true });
  if (up.error) throw new Error("upload_failed");

  const { error } = await admin.from("initial_assessments").update({
    status: "ready",
    title: c.title,
    slides: c.slides.map((s: { kind: string; title: string; bullets: string[] }) => ({ kind: s.kind, title: s.title, bullets: s.bullets })),
    guidelines: c.guidelines,
    file_path: path,
    file_name: FILE_NAME,
    error: null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (error) throw new Error("save_failed");
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { userId, admin } = auth;

  let action = "";
  try {
    const text = await req.text();
    if (text.length > 4096) return json({ error: "bad_request", message: "Request too large." }, 413);
    const body = JSON.parse(text || "{}");
    action = typeof body?.action === "string" ? body.action : "";
  } catch (_e) {
    return json({ error: "bad_request", message: "Invalid request." }, 400);
  }
  if (!["ensure", "start", "status", "remove"].includes(action)) return json({ error: "bad_request", message: "Unknown action." }, 400);

  try {
    if (action === "status") return await reply(admin, userId);

    if (action === "remove") {
      // Deleting the generated deck: only after the assessment is completed. Results and the
      // completed flag stay, so the onboarding deck is never generated again.
      const row = await getRow(admin, userId);
      if (!row) return json({ error: "not_found", message: "No assessment found." }, 404);
      if (row.status !== "completed") return json({ error: "invalid_state", message: "Finish the assessment before deleting it." }, 409);
      if (row.file_path) {
        const rm = await admin.storage.from("presentations").remove([row.file_path]);
        if (rm.error) return json({ error: "storage_failed", message: "Could not delete the file. Please try again.", retryable: true }, 502);
        await admin.from("initial_assessments").update({ file_path: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
      }
      return await reply(admin, userId);
    }

    if (action === "start") {
      const row = await getRow(admin, userId);
      if (!row) return json({ error: "not_found", message: "No assessment found." }, 404);
      if (row.status === "ready") {
        await admin.from("initial_assessments").update({ status: "in_progress", updated_at: new Date().toISOString() })
          .eq("user_id", userId).eq("status", "ready");
      } else if (row.status !== "in_progress" && row.status !== "completed") {
        return json({ error: "invalid_state", message: "The assessment is not ready yet." }, 409);
      }
      return await reply(admin, userId);
    }

    // ensure
    const { data: begin, error: rpcErr } = await admin.rpc("begin_assessment_generation", { p_user: userId });
    if (rpcErr) return json({ error: "server_error", message: "Something went wrong. Please try again.", retryable: true }, 500);
    const act = begin?.action;
    if (act === "not_required") return await reply(admin, userId, false);
    if (act === "exists" || act === "busy") return await reply(admin, userId);
    if (act !== "generate") return json({ error: "server_error", message: "Something went wrong. Please try again.", retryable: true }, 500);

    if (!(await takeRateSlot(admin, userId, "generation", MAX_GENERATIONS_PER_HOUR))) {
      await admin.from("initial_assessments").update({ status: "failed", error: "rate_limited", updated_at: new Date().toISOString() }).eq("user_id", userId);
      return json({ error: "rate_limited", message: "Too many attempts. Please try again later.", retryable: true }, 429);
    }

    try {
      await generate(admin, userId);
    } catch (e) {
      console.error("assessment generation failed:", e instanceof Error ? e.message : "unknown");
      await admin.from("initial_assessments").update({ status: "failed", error: "generation_failed", updated_at: new Date().toISOString() }).eq("user_id", userId);
      return json({
        error: "generation_failed",
        message: "We could not prepare your assessment right now. Please try again.",
        retryable: true,
      }, 502);
    }
    return await reply(admin, userId, true);
  } catch (_e) {
    return json({ error: "server_error", message: "Something went wrong. Please try again.", retryable: true }, 500);
  }
});
