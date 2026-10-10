CREATE TABLE daily_scores (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL,
    id TEXT NOT NULL,
    payload TEXT NOT NULL,
    UNIQUE (group_id, id)
);
CREATE INDEX daily_scores_sync ON daily_scores (group_id, sequence);
