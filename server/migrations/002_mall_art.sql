-- Swappable art (docs/adr/0006): the mall building as a package of four uploaded assets.
-- All null = the built-in greybox. A file in use can't be deleted (restrict).

alter table mall
  add column art_model uuid references assets (id) on delete restrict,
  add column art_collision uuid references assets (id) on delete restrict,
  add column art_meta uuid references assets (id) on delete restrict,
  add column art_navgrid uuid references assets (id) on delete restrict,
  add constraint mall_art_complete check (num_nulls(art_model, art_collision, art_meta, art_navgrid) in (0, 4));
