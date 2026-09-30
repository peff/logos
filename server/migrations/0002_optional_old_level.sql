-- Preserve historical comparisons while allowing reports of just the current rating.
CREATE TABLE difficulty_feedback_new (
	id TEXT PRIMARY KEY NOT NULL,
	received_at INTEGER NOT NULL,
	sender_id TEXT NOT NULL,
	player_name TEXT,
	seed TEXT NOT NULL,
	generator_version INTEGER NOT NULL,
	rating_version TEXT NOT NULL,
	old_level TEXT CHECK (old_level IN ('easy', 'medium', 'hard')),
	new_level TEXT NOT NULL CHECK (new_level IN ('easy', 'medium', 'hard')),
	answer TEXT NOT NULL CHECK (answer IN
		('about-right', 'felt-easier', 'felt-harder', 'unsure')),
	outcome TEXT NOT NULL CHECK (outcome IN ('won', 'lost')),
	elapsed_ms INTEGER CHECK (elapsed_ms >= 0),
	hints_used INTEGER NOT NULL CHECK (hints_used IN (0, 1)),
	continued_after_loss INTEGER NOT NULL CHECK (continued_after_loss IN (0, 1)),
	zen_mode INTEGER NOT NULL CHECK (zen_mode IN (0, 1))
);

INSERT INTO difficulty_feedback_new SELECT * FROM difficulty_feedback;
DROP TABLE difficulty_feedback;
ALTER TABLE difficulty_feedback_new RENAME TO difficulty_feedback;
