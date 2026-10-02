-- A clothing product's size chart: [{ "size": "M", "cm": { "chest": 100, ... } }, ...], the
-- garment's own measurements per size (shared/src/fit.ts). Shoppers' measurements never come here.
alter table products add column sizes jsonb;
