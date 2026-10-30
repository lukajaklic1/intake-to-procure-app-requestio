-- The day a contract was given notice ("odpovedana"): from then until the end date it is "in notice period".
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS notice_given_at date;
