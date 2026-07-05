-- CapCraft seed: 40 starter players (browser SQL Editor version)
-- Run AFTER migration 007. Safe to re-run: does nothing for names already present.
insert into public.players (full_name, first_name, last_name, positions)
select v.full_name, v.first_name, v.last_name, v.positions
from (values
  ('Nikola Jokic', 'Nikola', 'Jokic', array['C']::text[]),
  ('Shai Gilgeous-Alexander', 'Shai', 'Gilgeous-Alexander', array['PG','SG']::text[]),
  ('Luka Doncic', 'Luka', 'Doncic', array['PG','SG']::text[]),
  ('Giannis Antetokounmpo', 'Giannis', 'Antetokounmpo', array['PF','C']::text[]),
  ('Jayson Tatum', 'Jayson', 'Tatum', array['SF','PF']::text[]),
  ('Joel Embiid', 'Joel', 'Embiid', array['C']::text[]),
  ('Victor Wembanyama', 'Victor', 'Wembanyama', array['C','PF']::text[]),
  ('Stephen Curry', 'Stephen', 'Curry', array['PG']::text[]),
  ('Kevin Durant', 'Kevin', 'Durant', array['SF','PF']::text[]),
  ('LeBron James', 'LeBron', 'James', array['SF','PF']::text[]),
  ('Anthony Davis', 'Anthony', 'Davis', array['PF','C']::text[]),
  ('Anthony Edwards', 'Anthony', 'Edwards', array['SG']::text[]),
  ('Devin Booker', 'Devin', 'Booker', array['SG']::text[]),
  ('Damian Lillard', 'Damian', 'Lillard', array['PG']::text[]),
  ('Donovan Mitchell', 'Donovan', 'Mitchell', array['SG']::text[]),
  ('Ja Morant', 'Ja', 'Morant', array['PG']::text[]),
  ('Tyrese Haliburton', 'Tyrese', 'Haliburton', array['PG']::text[]),
  ('Jaylen Brown', 'Jaylen', 'Brown', array['SG','SF']::text[]),
  ('Jimmy Butler', 'Jimmy', 'Butler', array['SF']::text[]),
  ('Kawhi Leonard', 'Kawhi', 'Leonard', array['SF']::text[]),
  ('Paul George', 'Paul', 'George', array['SF']::text[]),
  ('Bam Adebayo', 'Bam', 'Adebayo', array['C','PF']::text[]),
  ('Domantas Sabonis', 'Domantas', 'Sabonis', array['C','PF']::text[]),
  ('Karl-Anthony Towns', 'Karl-Anthony', 'Towns', array['C','PF']::text[]),
  ('Trae Young', 'Trae', 'Young', array['PG']::text[]),
  ('De''Aaron Fox', 'De''Aaron', 'Fox', array['PG']::text[]),
  ('Zion Williamson', 'Zion', 'Williamson', array['PF']::text[]),
  ('Jalen Brunson', 'Jalen', 'Brunson', array['PG']::text[]),
  ('Kyrie Irving', 'Kyrie', 'Irving', array['PG','SG']::text[]),
  ('Rudy Gobert', 'Rudy', 'Gobert', array['C']::text[]),
  ('Pascal Siakam', 'Pascal', 'Siakam', array['PF']::text[]),
  ('Jrue Holiday', 'Jrue', 'Holiday', array['PG','SG']::text[]),
  ('Derrick White', 'Derrick', 'White', array['PG','SG']::text[]),
  ('Alperen Sengun', 'Alperen', 'Sengun', array['C']::text[]),
  ('Cade Cunningham', 'Cade', 'Cunningham', array['PG']::text[]),
  ('Paolo Banchero', 'Paolo', 'Banchero', array['PF']::text[]),
  ('Franz Wagner', 'Franz', 'Wagner', array['SF','PF']::text[]),
  ('Scottie Barnes', 'Scottie', 'Barnes', array['SF','PF']::text[]),
  ('Evan Mobley', 'Evan', 'Mobley', array['PF','C']::text[]),
  ('Chet Holmgren', 'Chet', 'Holmgren', array['C','PF']::text[])
) as v(full_name, first_name, last_name, positions)
where not exists (
  select 1 from public.players p
  where lower(p.full_name) = lower(v.full_name)
);
