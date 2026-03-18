-- ============================================
-- Lancio — Toutes les tables pour le Back Office
-- Run this in Supabase SQL Editor
-- ============================================

-- ── 1. AJOUTER colonnes manquantes sur lancio_orders ──
ALTER TABLE lancio_orders ADD COLUMN IF NOT EXISTS seen BOOLEAN DEFAULT false;
ALTER TABLE lancio_orders ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT false;
ALTER TABLE lancio_orders ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE lancio_orders ADD COLUMN IF NOT EXISTS maintenance BOOLEAN DEFAULT false;
ALTER TABLE lancio_orders ADD COLUMN IF NOT EXISTS maintenance_price_monthly INTEGER DEFAULT 0;
ALTER TABLE lancio_orders ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE lancio_orders ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE lancio_orders ADD COLUMN IF NOT EXISTS instalments JSONB;
ALTER TABLE lancio_orders ADD COLUMN IF NOT EXISTS manual BOOLEAN DEFAULT false;

-- Permettre à anon de lire (pour le BO qui utilise la clé anon)
CREATE POLICY "anon_select_lancio_orders" ON lancio_orders
  FOR SELECT TO anon
  USING (true);

-- Permettre à anon de mettre à jour (BO patch depuis le navigateur)
CREATE POLICY "anon_update_lancio_orders" ON lancio_orders
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Permettre à anon de supprimer (BO delete)
CREATE POLICY "anon_delete_lancio_orders" ON lancio_orders
  FOR DELETE TO anon
  USING (true);


-- ── 2. TABLE lancio_messages ──
CREATE TABLE IF NOT EXISTS lancio_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),

  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  tel TEXT,
  message TEXT NOT NULL,

  -- BO tracking
  seen BOOLEAN DEFAULT false,
  done BOOLEAN DEFAULT false,
  internal_notes TEXT,
  source TEXT DEFAULT 'lancio.fr'
);

ALTER TABLE lancio_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_lancio_messages" ON lancio_messages
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_lancio_messages" ON lancio_messages
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_lancio_messages" ON lancio_messages
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_lancio_messages" ON lancio_messages
  FOR DELETE TO anon USING (true);

CREATE POLICY "service_full_lancio_messages" ON lancio_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lancio_messages_created ON lancio_messages(created_at DESC);


-- ── 3. TABLE lancio_audit_requests ──
CREATE TABLE IF NOT EXISTS lancio_audit_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),

  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  tel TEXT,
  secteur TEXT,
  site_actuel TEXT,
  website TEXT,

  -- BO tracking
  seen BOOLEAN DEFAULT false,
  done BOOLEAN DEFAULT false,
  internal_notes TEXT,
  source TEXT DEFAULT 'lancio.fr'
);

ALTER TABLE lancio_audit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_lancio_audit_requests" ON lancio_audit_requests
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_lancio_audit_requests" ON lancio_audit_requests
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_lancio_audit_requests" ON lancio_audit_requests
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_lancio_audit_requests" ON lancio_audit_requests
  FOR DELETE TO anon USING (true);

CREATE POLICY "service_full_lancio_audit_requests" ON lancio_audit_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lancio_audit_created ON lancio_audit_requests(created_at DESC);


-- ── 4. TABLE lancio_onboarding ──
CREATE TABLE IF NOT EXISTS lancio_onboarding (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),

  order_id UUID REFERENCES lancio_orders(id),

  nom TEXT,
  email TEXT,
  tel TEXT,
  secteur TEXT,
  entreprise TEXT,
  domaine TEXT,
  description TEXT,

  -- Brief site
  textes_fournis TEXT,
  photos_fournies BOOLEAN DEFAULT false,
  logo_fourni BOOLEAN DEFAULT false,
  couleurs TEXT,
  sites_reference TEXT,

  -- Suivi
  status TEXT DEFAULT 'pending',
  wetransfer_url TEXT,

  -- BO tracking
  seen BOOLEAN DEFAULT false,
  done BOOLEAN DEFAULT false,
  internal_notes TEXT,
  source TEXT DEFAULT 'lancio.fr',

  -- Manual creation from BO
  client_name TEXT,
  business_name TEXT
);

ALTER TABLE lancio_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_lancio_onboarding" ON lancio_onboarding
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_lancio_onboarding" ON lancio_onboarding
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_lancio_onboarding" ON lancio_onboarding
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_lancio_onboarding" ON lancio_onboarding
  FOR DELETE TO anon USING (true);

CREATE POLICY "service_full_lancio_onboarding" ON lancio_onboarding
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lancio_onboarding_created ON lancio_onboarding(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lancio_onboarding_order ON lancio_onboarding(order_id);
