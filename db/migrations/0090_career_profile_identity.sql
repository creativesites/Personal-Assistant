-- CV Studio polish: career_profiles was missing the two fields every CV
-- actually needs at the top of the page — a full name and an email address.
-- buildCvRenderData() was falling back to `profile.headline || cv.title`
-- for fullName (a professional title or the CV's own title standing in for
-- a person's name), and no email ever appeared on a generated CV at all.
-- Both are plain nullable columns, same convention as phone/location/etc.
-- from migration 0081 — filled in once by the wizard, not auto-derived from
-- users.full_name/users.email on every read, since a person may want a
-- different display name/professional email on their CV than their Zuri
-- login identity.
ALTER TABLE career_profiles
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email     VARCHAR(255);
