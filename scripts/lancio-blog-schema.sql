-- ============================================================
-- LANCIO — Table lancio_blog_posts
-- Même Supabase que Mizra
-- À exécuter après lancio-supabase-schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS lancio_blog_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  secteur text,
  content text,
  published_at date DEFAULT CURRENT_DATE,
  status text DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  source text DEFAULT 'auto',  -- 'auto' | 'manual'
  views integer DEFAULT 0
);

-- Index pour les requêtes slug et date
CREATE INDEX IF NOT EXISTS lancio_blog_slug_idx ON lancio_blog_posts(slug);
CREATE INDEX IF NOT EXISTS lancio_blog_date_idx ON lancio_blog_posts(published_at DESC);

-- RLS
ALTER TABLE lancio_blog_posts ENABLE ROW LEVEL SECURITY;

-- Lecture publique (le site affiche les articles)
CREATE POLICY "lancio_blog_public_read"
  ON lancio_blog_posts FOR SELECT
  TO anon
  USING (status = 'published');

-- Insert depuis le script auto (anon key)
CREATE POLICY "lancio_blog_insert_anon"
  ON lancio_blog_posts FOR INSERT
  TO anon
  WITH CHECK (true);

-- Update réservé aux authentifiés
CREATE POLICY "lancio_blog_update_auth"
  ON lancio_blog_posts FOR UPDATE
  TO authenticated
  USING (true);

-- ============================================================
-- VÉRIFICATION
-- ============================================================
SELECT 'lancio_blog_posts créée ✓' AS status;
