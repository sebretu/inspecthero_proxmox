ALTER TABLE trommels 
ADD COLUMN IF NOT EXISTS pickup_requested_at timestamptz,
ADD COLUMN IF NOT EXISTS pickup_requested_email_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pickup_email_sent boolean DEFAULT false;
