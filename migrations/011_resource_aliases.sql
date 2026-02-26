-- Resource alias table: maps ALL known external identifiers to ops_resources.id.
-- Used by the resource resolver to translate room names, abbreviations,
-- Veracross IDs, Google Calendar locations, etc. into a reliable resource_id.
--
-- This replaces all fuzzy/substring matching with exact lookups.

CREATE TABLE IF NOT EXISTS ops_resource_aliases (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER NOT NULL REFERENCES ops_resources(id) ON DELETE CASCADE,
  alias_type TEXT NOT NULL,
  alias_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alias_type, alias_value)
);

CREATE INDEX IF NOT EXISTS idx_resource_aliases_value
  ON ops_resource_aliases(alias_value);

CREATE INDEX IF NOT EXISTS idx_resource_aliases_resource
  ON ops_resource_aliases(resource_id);

-- Auto-populate from existing ops_resources data
INSERT INTO ops_resource_aliases (resource_id, alias_type, alias_value)
SELECT id, 'veracross_id', CAST(id AS TEXT) FROM ops_resources
ON CONFLICT (alias_type, alias_value) DO NOTHING;

INSERT INTO ops_resource_aliases (resource_id, alias_type, alias_value)
SELECT id, 'description', LOWER(TRIM(description)) FROM ops_resources
WHERE description IS NOT NULL AND TRIM(description) != ''
ON CONFLICT (alias_type, alias_value) DO NOTHING;

INSERT INTO ops_resource_aliases (resource_id, alias_type, alias_value)
SELECT id, 'abbreviation', LOWER(TRIM(abbreviation)) FROM ops_resources
WHERE abbreviation IS NOT NULL AND TRIM(abbreviation) != ''
ON CONFLICT (alias_type, alias_value) DO NOTHING;
