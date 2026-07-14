-- Migration 0051: Add AI price-negotiation fields to products
-- min_price / max_price: the floor and ceiling the AI may quote
-- discount_min_pct / discount_max_pct: percentage discount range the AI can offer autonomously

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS min_price         NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS max_price         NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS discount_min_pct  NUMERIC(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_max_pct  NUMERIC(5, 2) DEFAULT 0;
