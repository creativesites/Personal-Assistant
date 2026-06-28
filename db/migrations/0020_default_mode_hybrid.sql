ALTER TABLE users ALTER COLUMN mode SET DEFAULT 'hybrid';
UPDATE users SET mode = 'hybrid' WHERE mode = 'business' OR mode IS NULL;
