CREATE TABLE players (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL
);
--> statement-breakpoint

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX sessions_expiry ON sessions(expires_at);
--> statement-breakpoint

CREATE TABLE consumed_sign_ins (
  challenge TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);
