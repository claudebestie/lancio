-- ============================================
-- Lancio Orders Table
-- Run this in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS lancio_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Customer info
  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  tel TEXT,
  secteur TEXT NOT NULL,
  entreprise TEXT NOT NULL,
  domaine TEXT,
  description TEXT NOT NULL,

  -- Options & pricing
  options JSONB,
  options_total INTEGER DEFAULT 0,
  base_price INTEGER DEFAULT 650,
  total_price INTEGER NOT NULL,

  -- Status tracking
  status TEXT DEFAULT 'new',
  source TEXT DEFAULT 'lancio.fr',

  -- Payment
  payment_status TEXT DEFAULT 'pending',
  stripe_session_id TEXT,

  -- Internal
  notes TEXT
);

-- Row Level Security
ALTER TABLE lancio_orders ENABLE ROW LEVEL SECURITY;

-- Anon users can insert (form submissions from browser)
CREATE POLICY "anon_insert_lancio_orders" ON lancio_orders
  FOR INSERT TO anon
  WITH CHECK (true);

-- Service role has full access (for admin/CRM)
CREATE POLICY "service_full_access_lancio_orders" ON lancio_orders
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lancio_orders_status ON lancio_orders(status);
CREATE INDEX IF NOT EXISTS idx_lancio_orders_created_at ON lancio_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lancio_orders_email ON lancio_orders(email);
