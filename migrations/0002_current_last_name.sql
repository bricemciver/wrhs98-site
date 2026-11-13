-- Current (e.g. married) last name lives on the roster entry so admins can set
-- it for classmates who haven't joined; members edit the same field from their
-- profile. classmates.last_name stays the name in 1998 (maiden name).
ALTER TABLE classmates ADD COLUMN current_last_name TEXT;

-- Carry over anything members already entered on their profile.
UPDATE classmates
   SET current_last_name = (
         SELECT p.current_last_name FROM profiles p JOIN users u ON u.id = p.user_id
          WHERE u.classmate_id = classmates.id)
 WHERE EXISTS (
         SELECT 1 FROM profiles p JOIN users u ON u.id = p.user_id
          WHERE u.classmate_id = classmates.id AND p.current_last_name IS NOT NULL AND p.current_last_name != '');

ALTER TABLE profiles DROP COLUMN current_last_name;
