-- Number of rooms of the hotel (entered in Settings); used to size the product and for per-room comparisons.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS room_count integer CHECK (room_count IS NULL OR room_count >= 0);
