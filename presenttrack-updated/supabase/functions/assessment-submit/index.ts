// POST multipart/form-data: audio (File), duration_sec, optional presentation_id
import { authenticate, chatJson, json, openaiFetch, preflight, takeRateSlot } from "../_shared/edge.ts";
import { CRITERIA } from "../_shared/criteria.js";
import { computeMetrics } from "../_shared/metrics.js";
import { assessQuality } from "../_shared/quality.js";
import { classify } from "../_shared/classify.js";
import { ruleBasedFeedback, validateFeedback } from "../_shared/feedback.js";
import { FEEDBACK_SCHEMA, feedbackMessages } from "../_shared/prompts.js";

const MAX_TRANSCRIPTIONS_PER_HOUR = 6;
const MAX_WORDS_STORED = 2000;
const MAX_TRANSCRIPT_CHARS = 20000;

const EXT: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/x-m4a": "m4a", "audio/m4a": "m4a",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
  "audio/aac": "m4a", "audio/flac": "flac",
};
const r2 = (n: number) => Math.round(n * 100) / 100;

function bad(status: number, error: string, message: string) {
  return json({ error, message }, status);
}

async function transcribe(file: File, ext: string, mime: string) {
  const fd = new FormData();
  fd.append("file", new File([file], `recording.${ext}`, { type: mime }));
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  fd.append("timestamp_granularities[]", "segment");
  fd.append("prompt", "Um, uh, like, you know, ano. Transcribe every filler word exactly as spoken.");
  const res = await openaiFetch("audio/transcriptions", { method: "POST", body: fd }, 90_000);
  return await res.json();
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return bad(405, "method_not_allowed", "Method not allowed.");

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { userId, admin } = auth;

  try {
    // ---- input validation ----
    const ctype = req.headers.get("content-type") ?? "";
    if (!ctype.toLowerCase().startsWith("multipart/form-data")) return bad(415, "unsupported_media_type", "Please upload the recording as a form.");
    const len = Number(req.headers.get("content-length") ?? "0");
    if (len > CRITERIA.duration.maxAudioBytes + 64 * 1024) return bad(413, "file_too_large", "The recording is too large (10 MB maximum).");

    let form: FormData;
    try { form = await req.formData(); } catch (_e) { return bad(400, "bad_request", "Invalid upload."); }

    const audio = form.get("audio");
    if (!(audio instanceof File)) return bad(400, "bad_request", "No audio file was provided.");
    if (audio.size <= 0) return bad(400, "bad_request", "The recording is empty.");
    if (audio.size > CRITERIA.duration.maxAudioBytes) return bad(413, "file_too_large", "The recording is too large (10 MB maximum).");
    const mime = (audio.type || "").toLowerCase().split(";")[0].trim();
    if (!mime.startsWith("audio/")) return bad(415, "unsupported_media_type", "Please upload an audio recording.");
    const ext = EXT[mime] ?? "webm";

    const durRaw = form.get("duration_sec");
    const clientDuration = typeof durRaw === "string" ? Number(durRaw) : NaN;
    if (!Number.isFinite(clientDuration) || clientDuration < CRITERIA.duration.submitMinSec || clientDuration > CRITERIA.duration.submitMaxSec) {
      return bad(400, "invalid_duration", `The recording must be between ${CRITERIA.duration.submitMinSec} and ${CRITERIA.duration.submitMaxSec} seconds.`);
    }
    const pidRaw = form.get("presentation_id");
    const presentationId = typeof pidRaw === "string" && pidRaw ? pidRaw : null;

    // ---- state check ----
    const { data: row } = await admin.from("initial_assessments").select("id,status,quality").eq("user_id", userId).maybeSingle();
    if (!row) return bad(404, "not_found", "No assessment found.");
    if (presentationId && presentationId !== row.id) return bad(400, "bad_request", "Assessment mismatch.");
    const retake = row.status === "completed" && row.quality === "low";
    if (row.status === "completed" && !retake) return bad(409, "already_completed", "You have already completed this assessment.");
    if (row.status !== "ready" && row.status !== "in_progress" && !retake) return bad(409, "invalid_state", "The assessment is not ready yet.");

    if (!(await takeRateSlot(admin, userId, "transcription", MAX_TRANSCRIPTIONS_PER_HOUR))) {
      return json({ error: "rate_limited", message: "Too many attempts. Please try again later.", retryable: true }, 429);
    }

    // ---- transcription ----
    // deno-lint-ignore no-explicit-any
    let tr: any;
    try {
      tr = await transcribe(audio, ext, mime);
    } catch (e) {
      console.error("transcription failed:", e instanceof Error ? e.message : "unknown");
      return json({ error: "transcription_failed", message: "We could not process your recording. Please try again.", retryable: true }, 502);
    }

    const words = Array.isArray(tr?.words) ? tr.words : [];
    const segments = Array.isArray(tr?.segments) ? tr.segments : [];
    const text = typeof tr?.text === "string" ? tr.text.slice(0, MAX_TRANSCRIPT_CHARS) : "";
    const upstreamDur = Number(tr?.duration);
    const totalDurationSec = Number.isFinite(upstreamDur) && upstreamDur > 0 ? upstreamDur : clientDuration;

    const metrics = computeMetrics({ words, segments, totalDurationSec });
    const quality = assessQuality(metrics, segments);
    if (quality.level === "unusable") {
      return json({
        error: "unusable_recording",
        message: "We could not hear enough speech in this recording to give meaningful results. Please try again in a quiet place, closer to your microphone.",
        quality,
        canRetry: true,
      }, 422);
    }

    const result = classify(metrics, quality, CRITERIA);

    // ---- feedback (AI with rule-based fallback) ----
    let feedback = null;
    try {
      const summary = {
        classification: result.classification, score: result.score, qualityLevel: quality.level,
        wordsPerMinuteWhileSpeaking: metrics.wpm, totalDurationSec: metrics.totalDurationSec, targetDurationSec: [CRITERIA.duration.targetMinSec, CRITERIA.duration.targetMaxSec],
        idealWpm: [CRITERIA.pace.idealMin, CRITERIA.pace.idealMax],
        possibleFillerCount: metrics.fillerCount, possibleFillersPerMinute: metrics.fillersPerMin,
        longPauseCount: metrics.pauseCount, longPauseThresholdSec: CRITERIA.pauses.longPauseSec, longestPauseSec: metrics.longestPause,
        dimensionLabels: Object.fromEntries(Object.entries(result.dims).map(([k, v]) => [k, (v as { label: string }).label])),
      };
      feedback = validateFeedback(await chatJson(feedbackMessages(summary), FEEDBACK_SCHEMA, 45_000, 0.4));
    } catch (_e) { feedback = null; }
    if (!feedback) feedback = ruleBasedFeedback(metrics, result);

    const results = {
      version: 1,
      criteria: CRITERIA,
      quality,
      metrics,
      durationAssessment: result.durationAssessment,
      dims: result.dims,
      totalPoints: result.totalPoints,
      maxPoints: result.maxPoints,
      score: result.score,
      classification: result.classification,
      explanation: result.explanation,
      feedback,
      transcript: text,
      // deno-lint-ignore no-explicit-any
      words: words.slice(0, MAX_WORDS_STORED).map((w: any) => ({ w: String(w?.word ?? "").slice(0, 40), s: r2(Number(w?.start) || 0), e: r2(Number(w?.end) || 0) })),
      created_at: new Date().toISOString(),
    };

    const { error } = await admin.rpc("complete_initial_assessment", {
      p_user: userId, p_results: results, p_classification: result.classification, p_quality: quality.level,
    });
    if (error) {
      console.error("complete_initial_assessment failed");
      return json({ error: "save_failed", message: "We could not save your results. Please try again.", retryable: true }, 500);
    }
    return json({ ok: true, results });
  } catch (_e) {
    return json({ error: "server_error", message: "Something went wrong. Please try again.", retryable: true }, 500);
  }
});
