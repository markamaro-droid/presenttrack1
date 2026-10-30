/* Supabase settings. Fill these in from: Supabase dashboard -> Project Settings -> API Keys / Data API.
   The publishable (or "anon") key is SAFE to expose in browser code ONLY because Row Level Security is on
   (see sql/schema.sql). NEVER put the secret / service_role key here.
   Leave both empty to run in demo mode (in-memory accounts, nothing saved). */
window.PT_SUPABASE = {
  url: "https://wzmsyordhvfxinlpfbhc.supabase.co",      // e.g. "https://abcdxyzcompany.supabase.co"
  anonKey: "sb_publishable_zatxgPcJHfL_kGVfd4hyNw_sYNoy_yU"   // e.g. "sb_publishable_..." (or the legacy "anon" JWT key)
};
