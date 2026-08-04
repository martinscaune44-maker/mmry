// ---------------------------------------------------------------------------
// Supabase connection.
//
// The anon key is meant to be public — it identifies the project, and what it
// can actually do is decided by the row-level security policies in
// supabase/schema.sql. The service_role key is the dangerous one and must never
// appear in this repo.
// ---------------------------------------------------------------------------

const SUPABASE_URL = "https://udtsdkrvrhnazqtwwipg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkdHNka3J2cmhuYXpxdHd3aXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NDQ3MjAsImV4cCI6MjEwMTQyMDcyMH0.VtEKJsoq-M4igoygu7K0MKhCGSNieriT30TxUJ9wE1c";
