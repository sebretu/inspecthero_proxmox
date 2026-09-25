-- Add notification_settings column to profiles table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'notification_settings') THEN
        ALTER TABLE profiles ADD COLUMN notification_settings jsonb DEFAULT '{"notify_on_create": true, "notify_on_status": true, "notify_on_assign": true}'::jsonb;
    END IF;
END $$;
