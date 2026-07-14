-- Migration 0053: Supabase storage INSERT policies for all app buckets
--
-- Supabase public buckets still require explicit INSERT RLS policies for
-- client-side uploads using the anon key (Clerk-authenticated users don't
-- hold a Supabase auth.uid, so they upload as the anon role).
--
-- Each policy is guarded with a DO block to make the migration idempotent
-- (Supabase PG 15/16 does not support CREATE POLICY IF NOT EXISTS).

DO $$ BEGIN

  -- brands bucket — business profile logos and brand assets
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon can upload to brands'
  ) THEN
    EXECUTE 'CREATE POLICY "anon can upload to brands" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''brands'')';
  END IF;

  -- products bucket — product images uploaded from Studio catalog
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon can upload to products'
  ) THEN
    EXECUTE 'CREATE POLICY "anon can upload to products" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''products'')';
  END IF;

  -- knowledge-base bucket — files uploaded to Studio knowledge base
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon can upload to knowledge-base'
  ) THEN
    EXECUTE 'CREATE POLICY "anon can upload to knowledge-base" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''knowledge-base'')';
  END IF;

  -- documents bucket — generated PDFs stored by the intelligence service
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon can upload to documents'
  ) THEN
    EXECUTE 'CREATE POLICY "anon can upload to documents" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''documents'')';
  END IF;

  -- chat-media bucket — images/audio from WhatsApp conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon can upload to chat-media'
  ) THEN
    EXECUTE 'CREATE POLICY "anon can upload to chat-media" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''chat-media'')';
  END IF;

  -- assets bucket — general purpose app assets
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon can upload to assets'
  ) THEN
    EXECUTE 'CREATE POLICY "anon can upload to assets" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''assets'')';
  END IF;

  -- SELECT: allow anon to read object metadata (needed by the JS SDK)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon can read storage objects'
  ) THEN
    EXECUTE 'CREATE POLICY "anon can read storage objects" ON storage.objects FOR SELECT TO anon, authenticated USING (true)';
  END IF;

  -- UPDATE: allow overwriting existing files (logo replacement, product image swap)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon can update storage objects'
  ) THEN
    EXECUTE 'CREATE POLICY "anon can update storage objects" ON storage.objects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;

END $$;
