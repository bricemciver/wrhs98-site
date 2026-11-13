-- Washburn Rural–specific album and descriptions. Descriptions are only
-- updated if an admin hasn't already changed them.
INSERT OR IGNORE INTO albums (slug, title, description, sort_order) VALUES
  ('junior-blues-sports', 'Junior Blues Sports', 'Games, meets, and pep rallies, including the 1995–97 state title teams.', 4);

UPDATE albums SET description = 'Senior year and the rest of our time at Washburn Rural, 1994–98.'
 WHERE slug = 'senior-year' AND description = 'Photos from 1997–98.';
