-- ============================================
-- Lancio Pipeline Logs — Table manquante
-- Copier-coller dans Supabase SQL Editor et exécuter
-- ============================================

CREATE TABLE IF NOT EXISTS lancio_pipeline_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),

  run_id TEXT NOT NULL,
  ville TEXT NOT NULL,
  secteur TEXT NOT NULL,

  contacts_total INTEGER DEFAULT 0,
  contacts_imported INTEGER DEFAULT 0,

  lobstr_run_id TEXT,
  brevo_list_id INTEGER,
  brevo_list_name TEXT,
  campaigns JSONB,

  status TEXT DEFAULT 'pending',
  error_message TEXT
);

ALTER TABLE lancio_pipeline_logs ENABLE ROW LEVEL SECURITY;

-- Dashboard (clé anon) peut lire
CREATE POLICY "anon_select_lancio_pipeline_logs" ON lancio_pipeline_logs
  FOR SELECT TO anon USING (true);

-- Pipeline (clé anon depuis GitHub Actions) peut écrire
CREATE POLICY "anon_insert_lancio_pipeline_logs" ON lancio_pipeline_logs
  FOR INSERT TO anon WITH CHECK (true);

-- Service role accès complet
CREATE POLICY "service_full_lancio_pipeline_logs" ON lancio_pipeline_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lancio_pipeline_logs_created ON lancio_pipeline_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lancio_pipeline_logs_ville ON lancio_pipeline_logs(ville, secteur);
