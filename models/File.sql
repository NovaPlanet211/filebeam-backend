-- models/File.sql — Schemat tabeli metadanych plików (Postgres)

-- Użytkownicy (opcjonalnie, jeśli chcesz mieć tabelę users)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  account_type VARCHAR(50) NOT NULL DEFAULT 'standardowe',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Pliki (metadane)
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,    -- przechowujemy username, dla prostoty
  filename VARCHAR(512) NOT NULL,
  key VARCHAR(1024) NOT NULL,       -- np. "nova/atlas.png"
  size BIGINT,                      -- opcjonalnie (możesz wypełniać przy listowaniu z R2)
  content_type VARCHAR(255),        -- opcjonalnie
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);

-- Indeksy pomocnicze
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_key ON files(key);
