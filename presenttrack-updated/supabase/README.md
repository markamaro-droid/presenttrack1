# Initial Presentation Assessment: backend

Supabase SQL + two Edge Functions (Deno). The OpenAI key lives only in function secrets.

## Deploy
1. `supabase link --project-ref <your-project-ref>`
2. Database: `supabase db push`, or paste `migrations/20261028_initial_assessment.sql` into the SQL Editor. It is idempotent. The existing-account backfill runs only the first time (it checks whether `initial_assessment_completed` exists).
3. Secrets (placeholder only, never commit a real key):
   `supabase secrets set OPENAI_API_KEY=<your-openai-key> OPENAI_MODEL=gpt-4o-mini`
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)
4. `supabase functions deploy assessment-ensure assessment-submit`
5. Optional `supabase/config.toml` notes: both functions keep the default `verify_jwt = true`; they also verify the JWT themselves. Edge request time limits apply (generation can take up to ~2 minutes in the worst case with one retry).

Limits: 5 generations/hour and 6 transcriptions/hour per user (`ai_usage`); audio <= 10 MB, duration 20-900 s, `audio/*` only.

## API
Both: `Authorization: Bearer <user JWT>`; user identity comes only from the JWT.

`assessment-ensure` (POST JSON `{action:'ensure'|'start'|'status'}`) always returns
`{required, assessment:{id,status,title,slides,guidelines,file_path,file_name,results,classification,quality,error,completed_at}|null, userState:{initial_assessment_completed}}`.
Failure: 502 `{error:'generation_failed',message,retryable:true}`.

`assessment-submit` (multipart: `audio`, `duration_sec`, optional `presentation_id`) returns `{ok:true, results}`; 422 `{error:'unusable_recording',message,quality,canRetry:true}` (nothing is completed); 502 `{error:'transcription_failed',message,retryable:true}`; 409 if already completed with good quality (a completed result with quality `low` may be retaken).

## Metric definitions
- Words: every recognized token (punctuation stripped, lowercased). Filler tokens are included in the word count.
- `speakingDuration` = (last word end - first word start) - sum of gaps >= 2.0 s. Pauses shorter than 2 s count as speaking time; leading/trailing silence is excluded.
- `wpm` = words / (speakingDuration / 60). `overallWpm` = words / (total recording seconds / 60).
- Fillers and long pauses per minute use the span first-word-start to last-word-end.

## Classification (all thresholds in `functions/_shared/criteria.js`)
Each dimension scores 0-2 (max 8). WPM alone never decides the class.

| Dimension | 2 points | 1 point | 0 points |
|---|---|---|---|
| Pace (wpm) | 130-160 | 110-180 | outside |
| Fillers / min | <= 3 | <= 6 | > 6 |
| Long pauses (>= 2 s) / min | <= 2 | <= 5 | > 5 |
| Duration | 120-180 s | 90-210 s | outside |

Proficient: >= 7 of 8 and no dimension at 0. Developing: >= 4. Otherwise needs improvement.
Quality gate: unusable if < 40 words, speech < 25% of the recording, or most segments are no-speech (never completes). Low if mean recognition confidence (mean exp(avg_logprob)) < 0.5 (completes with a warning; retake allowed).

## Caveats
- Whisper often drops or smooths disfluencies, so filler counts are estimates and may be too low. The prompt asks it to keep them, which helps but does not guarantee it.
- "like" is counted only by heuristic (not after pronouns/verbs such as I, we, they, would, looks, feel(s), just, something, anything, and not before "to"); those are reported as possible fillers (`heuristic: true`). "you know" is skipped after do/did/if/as.
- Not evaluated: eye contact, gestures, confidence, body language, voice tone, content quality. Results are a baseline, not a definitive judgment.

## Tests
`cd supabase && NODE_PATH=<dir with pptxgenjs@3.12.0> DECK_OUT_DIR=<out dir> node --test tests/*.test.js`
The deck test also runs `unzip -t`, python-pptx and LibreOffice PDF conversion when available (skipped otherwise). `_shared/*.js` is environment-neutral; `_shared/edge.ts` and the two `index.ts` files are Deno-only and are not covered by Node tests.
