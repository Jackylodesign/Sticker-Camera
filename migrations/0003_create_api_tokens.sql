-- Personal API tokens for the Figma plugin. Only a SHA-256 hash of each token
-- is stored.
CREATE TABLE IF NOT EXISTS api_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   text NOT NULL UNIQUE,
  label        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
