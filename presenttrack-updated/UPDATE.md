# PresentTrack update: practice flow, delete, initial assessment

## What changed
- **Sidebar:** "Practice" removed. Practice is opened with the PRACTICE button on each card in My Presentations.
- **My Presentations:** each card shows preview, title, date, status, PRACTICE and DELETE.
- **Delete:** confirmation ("Are you sure you want to delete this presentation? This action cannot be undone."), Cancel / Delete, removes the record and its stored file, success or error message. Storage policies limit each user to their own folder.
- **Initial Presentation Assessment (new accounts only):** a system-generated 6-slide PowerPoint (OpenAI JSON content + PptxGenJS on the server), labelled "Initial Presentation Assessment" with status Assessment Required / In Progress / Completed. The user records the talk; it is transcribed and scored. Practicing your own presentations unlocks after it is completed. Dashboard and Settings stay available.
- **Existing accounts:** a one-time migration marks them as already assessed, so they are never forced through it and no deck is generated for them.
- **Metrics:** WPM, total words, duration vs 2-3 min target, filler words, long pauses (>= 2 s), recognition-quality warning with retry, classification (Needs Improvement / Developing / Proficient), strengths, improvements, next-practice recommendations.
- **Honest limits:** results are a baseline. Eye contact, gestures, confidence and body language are not evaluated.

## Files
- `js/assessment.js`, `css/assessment.css`: assessment UI (new)
- `js/dashboard.js`, `js/cloud.js`, `index.html`: updated
- `supabase/migrations/20261028_initial_assessment.sql`: schema, backfill, RLS, storage policies
- `supabase/functions/assessment-ensure`, `assessment-submit`, `_shared/*`: backend
- `supabase/tests/`: 27 tests
- `supabase/README.md`: API, metric definitions, scoring table

## Deploy
1. `supabase link --project-ref <your-project-ref>`
2. `supabase db push` (or paste the migration into the SQL Editor; it is safe to re-run)
3. `supabase secrets set OPENAI_API_KEY=<your-new-key> OPENAI_MODEL=gpt-4o-mini`
4. `supabase functions deploy assessment-ensure assessment-submit`
5. Register a test account and complete the assessment once.

**Never put the OpenAI key in any file or in browser code.** The key you pasted in chat should be revoked and replaced.

## Tested / not tested
Tested: 27 backend tests, generated .pptx validity, browser flows with a mocked backend (new and existing user, delete, practice gate).
Not tested: live OpenAI/Whisper calls, real Supabase RLS/storage. Whisper may drop "um"/"uh", so filler counts can be low.
