CREATE TABLE countdowns (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  target_date TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'dusk' CHECK (theme IN ('dusk', 'ocean', 'moss', 'rose', 'violet')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX countdowns_target_date_idx ON countdowns (target_date ASC);
