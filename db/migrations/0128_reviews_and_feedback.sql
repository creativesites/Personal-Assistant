-- 0128_reviews_and_feedback.sql
-- Reviews & Feedback tables for Public Marketing, SaaS Dashboard & Admin Moderation

CREATE TABLE IF NOT EXISTS user_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_role TEXT,
  author_company TEXT,
  author_avatar_url TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'dashboard', -- 'website' | 'dashboard'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general', -- 'bug' | 'feature' | 'ux' | 'general'
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'in_review' | 'resolved' | 'archived'
  admin_notes TEXT,
  contact_email TEXT,
  page_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_reviews_approved ON user_reviews(is_approved, is_featured);
CREATE INDEX IF NOT EXISTS idx_platform_feedback_status ON platform_feedback(status);
