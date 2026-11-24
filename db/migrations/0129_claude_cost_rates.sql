-- Claude 5.5 per-1K-token list prices for the Token Usage dashboard's cost
-- estimates (system_config.cost_per_1k_tokens, migration 0072). Merged into
-- the existing map so admin-edited rates for other models are preserved.
UPDATE system_config
SET value = value || '{
  "claude-haiku-5-5":  {"input_per_1k": 0.0001, "output_per_1k": 0.0005},
  "claude-sonnet-5-5": {"input_per_1k": 0.002,  "output_per_1k": 0.01},
  "claude-opus-5-5":   {"input_per_1k": 0.004,  "output_per_1k": 0.02}
}'::jsonb
WHERE key = 'cost_per_1k_tokens';
