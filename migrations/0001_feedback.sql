CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  submission_key TEXT NOT NULL UNIQUE,
  slide_id TEXT NOT NULL,
  slide_title TEXT NOT NULL,
  deck_revision TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'addressed')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_revision TEXT
);
CREATE INDEX IF NOT EXISTS feedback_status_date ON feedback(status, created_at);
