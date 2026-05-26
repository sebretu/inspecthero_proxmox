-- Allow users to insert their own profile row
CREATE POLICY "Allow user to insert own profile"
ON profiles
FOR INSERT
WITH CHECK (id = auth.uid());
