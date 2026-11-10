# PresentTract (foundation slice)
Built so far: Supabase schema + RLS + storage policies, server-authoritative baseline gate, and the tested speech-metrics engine.
Setup: copy `.env.example` to `.env.local`, apply `supabase/migrations/0001_core_schema.sql`, `npm install`, `npm test`.
Two-user RLS check: sign up two users, then as user A run `select * from presentations` via the client with user B's id filter; it must return 0 rows.
Place the companion model at `public/models/companion.glb` (not yet wired up).
