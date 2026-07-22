-- Migration 0102: Career OS & Advanced Task Upgrades

ALTER TABLE project_tasks 
  ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
