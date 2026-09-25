-- Debug: Check exactly what the RLS policy sees for bartek@demo.pl
-- Run this while logged in as bartek@demo.pl

-- 1. Check current user
SELECT auth.uid() AS current_user_id, auth.email() AS current_email;

-- 2. Check if current user has ADMIN role
SELECT 
    profiles.id,
    profiles.email,
    profiles.role,
    auth.uid() AS current_auth_uid,
    (profiles.id = auth.uid()) AS is_match,
    (profiles.role = 'ADMIN') AS has_admin_role
FROM profiles 
WHERE profiles.id = auth.uid();

-- 3. Check if the EXISTS clause works
SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'ADMIN'
) AS admin_check;

-- 4. Try to see what task you're trying to edit
SELECT 
    id,
    title,
    assigned_user_id,
    (assigned_user_id = auth.uid()) AS is_assigned_to_me,
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'ADMIN'
    ) AS i_am_admin
FROM tasks 
WHERE id = '02dec866-79ce-4854-80b2-8263dc2370e9';
