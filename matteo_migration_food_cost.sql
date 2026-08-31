-- Matteo Orders: Food Cost (Recipes + Ingredients)
-- Run once in the Supabase SQL editor. Safe to re-run (uses IF NOT EXISTS
-- throughout) even if you already ran an earlier version of this file.
--
-- Menu -> Food Cost lets the admin cost a Production item from its recipe: for
-- each ingredient, enter the package size bought, the price paid for that
-- package, and how much of it the recipe uses. The app sums the ingredient
-- costs into a BATCH total (total_cost) -- but the batch a recipe makes is
-- often not the same size as the pack the product is actually sold in (e.g.
-- Lasagna is made in a big tray but sold by the slice/tray-of-12). So the
-- admin also enters:
--   yield_qty / yield_unit  = how much the whole batch makes (e.g. 1.854 kg)
--   sell_qty  / sell_unit   = the pack size it's actually sold in (e.g. 1 kg)
-- cost_per_unit is what actually gets copied into products.cost_price (the
-- "Cost" used everywhere else -- Sales Metrics Food Cost Report, Client
-- Prices' Profit column, etc.) -- NOT the raw batch total_cost. If yield_qty
-- is left blank/0, the whole batch is treated as one sold unit. Ingredients
-- can also be flagged per_pack:true (e.g. a vacuum pouch or box used once per
-- sold pack) -- those are NOT diluted across the yield; they're added
-- straight onto cost_per_unit instead:
--   diluted      = sum of line_cost for ingredients where per_pack is not true
--   per_pack_sum = sum of line_cost for ingredients where per_pack is true
--   cost_per_unit = (diluted / yield_qty) * sell_qty + per_pack_sum
--
-- One recipe per product. ingredients is a JSON array of objects shaped like:
--   {"name":"Chicken breast","pkg_qty":5,"pkg_unit":"kg","pkg_price":22.50,"qty_used":1.2,"per_pack":false,"line_cost":5.40}

CREATE TABLE IF NOT EXISTS recipes (
  id bigint generated always as identity primary key,
  product_id bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_cost numeric NOT NULL DEFAULT 0,
  yield_qty numeric,
  yield_unit text,
  sell_qty numeric NOT NULL DEFAULT 1,
  sell_unit text,
  cost_per_unit numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One recipe per product.
CREATE UNIQUE INDEX IF NOT EXISTS recipes_product_id_key ON recipes(product_id);

-- Row Level Security: Food Cost is admin-only (the menu item is only shown to
-- the admin account, same as Sales Metrics / Client Prices are hidden from
-- Kitchen sub-admins), so only admin@matteo.local needs access here.
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipes_admin_select" ON recipes;
CREATE POLICY "recipes_admin_select" ON recipes
FOR SELECT USING (auth.jwt() ->> 'email' = 'admin@matteo.local');

DROP POLICY IF EXISTS "recipes_admin_insert" ON recipes;
CREATE POLICY "recipes_admin_insert" ON recipes
FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = 'admin@matteo.local');

DROP POLICY IF EXISTS "recipes_admin_update" ON recipes;
CREATE POLICY "recipes_admin_update" ON recipes
FOR UPDATE USING (auth.jwt() ->> 'email' = 'admin@matteo.local');

DROP POLICY IF EXISTS "recipes_admin_delete" ON recipes;
CREATE POLICY "recipes_admin_delete" ON recipes
FOR DELETE USING (auth.jwt() ->> 'email' = 'admin@matteo.local');

-- Nothing to backfill: existing products.cost_price values are left as-is. A
-- product only gets a `recipes` row once someone saves a recipe for it in
-- Menu -> Food Cost; until then it just shows "No recipe yet" with its
-- current Cost.


-- ── Shared ingredient library ──────────────────────────────────────────────
-- Whenever a recipe is saved in Menu -> Food Cost, each ingredient's package
-- size, unit and price paid is also saved (upserted, matched by name) into
-- this shared table. When typing an ingredient name in ANY recipe, the app
-- auto-fills its package qty/unit/price from here if that name was already
-- used elsewhere -- so you only need to enter "Garlic 1kg for £3.50" once,
-- not on every recipe that uses it.
--
-- Editing an ingredient here (Menu -> Food Cost -> Ingredients) updates every
-- saved recipe that uses it (by name) and recalculates that product's Cost
-- automatically. Deleting one only stops it being suggested for new entries
-- -- it doesn't touch recipes that already used it.
--
-- per_pack: whether this ingredient's cost should be charged once per SOLD
-- PACK instead of being diluted across the whole batch yield -- for
-- packaging-type items (a pouch, box, cup, label) whose cost scales with the
-- number of packs, not the size of the batch.

CREATE TABLE IF NOT EXISTS ingredients (
  id bigint generated always as identity primary key,
  name text NOT NULL,
  pkg_qty numeric,
  pkg_unit text,
  pkg_price numeric,
  per_pack boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One entry per ingredient name (case-insensitive), so "Garlic" and "garlic"
-- don't end up as two separate library entries.
CREATE UNIQUE INDEX IF NOT EXISTS ingredients_name_key ON ingredients (lower(name));

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ingredients_admin_select" ON ingredients;
CREATE POLICY "ingredients_admin_select" ON ingredients
FOR SELECT USING (auth.jwt() ->> 'email' = 'admin@matteo.local');

DROP POLICY IF EXISTS "ingredients_admin_insert" ON ingredients;
CREATE POLICY "ingredients_admin_insert" ON ingredients
FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = 'admin@matteo.local');

DROP POLICY IF EXISTS "ingredients_admin_update" ON ingredients;
CREATE POLICY "ingredients_admin_update" ON ingredients
FOR UPDATE USING (auth.jwt() ->> 'email' = 'admin@matteo.local');

DROP POLICY IF EXISTS "ingredients_admin_delete" ON ingredients;
CREATE POLICY "ingredients_admin_delete" ON ingredients
FOR DELETE USING (auth.jwt() ->> 'email' = 'admin@matteo.local');

-- Nothing to backfill: this fills in naturally as recipes are saved from now on.
