-- Add BOM consumption total column to purchase orders and keep it updated

-- 1) Add column on purchases header table (material-wise JSONB)
ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS bom_consumption jsonb DEFAULT '{}'::jsonb;

-- 2) Helper: extract first decimal number from text safely
CREATE OR REPLACE FUNCTION extract_first_numeric(text_input text)
RETURNS numeric AS $$
DECLARE
  m text;
BEGIN
  -- capture first number like 12 or 12.34 from the given text
  m := substring(text_input from '([0-9]+(?:\.[0-9]+)?)');
  IF m IS NULL OR m = '' THEN
    RETURN 0;
  END IF;
  RETURN m::numeric;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3) Compute material-wise BOM consumption JSON for a purchase
CREATE OR REPLACE FUNCTION compute_po_bom_consumption_json(p_purchase_id text)
RETURNS jsonb AS $$
DECLARE
  v_json jsonb;
BEGIN
  /*
    Logic:
    - Flatten purchase order lines (handling both JSON arrays and JSON strings).
    - Clean product names (remove bracketed prefixes, normalize spacing/case).
    - Parse BOM variant consumption JSON embedded inside bom_lines.notes.
    - Match purchase lines to variant entries by normalized label.
    - Multiply matched variant quantity by ordered quantity; aggregate per raw material.
  */
  WITH po AS (
    SELECT p.id, p.order_lines
    FROM public.purchases p
    WHERE p.id = p_purchase_id
  ),
  order_line_source AS (
    SELECT 
      CASE 
        WHEN jsonb_typeof(po.order_lines) = 'array' THEN po.order_lines
        WHEN jsonb_typeof(po.order_lines) = 'string' THEN
          COALESCE(
            (
              replace(
                replace(
                  replace(trim(both '"' from po.order_lines::text), '\\"', '"'),
                  '\\n',
                  ''
                ),
                '\\\\',
                '\\'
              )
            )::jsonb,
            '[]'::jsonb
          )
        ELSE '[]'::jsonb
      END AS ol_array
    FROM po
  ),
  lines_raw AS (
    SELECT
      gen_random_uuid() AS line_id,
      COALESCE(
        NULLIF(ol->>'product_name', ''),
        NULLIF((ol->'product')::jsonb->>'name', ''),
        NULLIF(ol->>'name', ''),
        ''
      ) AS product_name_raw,
      COALESCE(
        NULLIF(ol->>'product_qty', ''),
        NULLIF(ol->>'quantity', ''),
        NULLIF(ol->>'qty', ''),
        '0'
      )::numeric AS qty_ordered
    FROM order_line_source,
      LATERAL jsonb_array_elements(order_line_source.ol_array) AS ol
  ),
  lines AS (
    SELECT
      line_id,
      qty_ordered,
      product_name_raw,
      upper(
        btrim(
          regexp_replace(
            regexp_replace(
              COALESCE(product_name_raw, ''),
              '\\s*[\\(\\[].*?[\\)\\]]\\s*',
              '',
              'g'
            ),
            '\\s+',
            ' ',
            'g'
          )
        )
      ) AS product_label_clean
    FROM lines_raw
    WHERE product_name_raw <> ''
  ),
  bom_variant_json AS (
    SELECT
      bl.raw_material_id,
      COALESCE(bl.unit, rm.base_unit) AS material_unit,
      (regexp_match(bl.notes, 'Variant consumptions:\\s*(\\[.*\\])', 's'))[1] AS variant_json_text
    FROM bom_lines bl
    JOIN raw_materials rm ON rm.id = bl.raw_material_id
    WHERE bl.notes ILIKE '%Variant consumptions:%'
  ),
  variant_data AS (
    SELECT
      bvj.raw_material_id,
      bvj.material_unit,
      upper(
        btrim(
          regexp_replace(
            regexp_replace(
              (variant->>'label')::text,
              '\\s*[\\(\\[].*?[\\)\\]]\\s*',
              '',
              'g'
            ),
            '\\s+',
            ' ',
            'g'
          )
        )
      ) AS variant_label_clean,
      COALESCE((variant->>'quantity')::numeric, 0) AS variant_quantity
    FROM bom_variant_json bvj
    CROSS JOIN LATERAL jsonb_array_elements(
      bvj.variant_json_text::jsonb
    ) AS variant
    WHERE bvj.variant_json_text IS NOT NULL
  ),
  line_matches AS (
    SELECT
      l.line_id,
      l.qty_ordered,
      vd.raw_material_id,
      vd.material_unit,
      vd.variant_quantity,
      ROW_NUMBER() OVER (
        PARTITION BY l.line_id, vd.raw_material_id
        ORDER BY
          CASE
            WHEN vd.variant_label_clean = l.product_label_clean THEN 0
            WHEN vd.variant_label_clean LIKE '%' || l.product_label_clean || '%' THEN 1
            WHEN l.product_label_clean LIKE '%' || vd.variant_label_clean || '%' THEN 2
            ELSE 3
          END,
          ABS(length(vd.variant_label_clean) - length(l.product_label_clean))
      ) AS match_rank
    FROM lines l
    JOIN variant_data vd
      ON (
        vd.variant_label_clean = l.product_label_clean
        OR vd.variant_label_clean LIKE '%' || l.product_label_clean || '%'
        OR l.product_label_clean LIKE '%' || vd.variant_label_clean || '%'
      )
  ),
  best_matches AS (
    SELECT *
    FROM line_matches
    WHERE match_rank = 1
  ),
  material_totals AS (
    SELECT
      bm.raw_material_id AS material_id,
      rm.name AS material_name,
      bm.material_unit AS unit,
      mc.id AS category_id,
      mc.name AS category_name,
      ROUND(SUM(bm.qty_ordered * bm.variant_quantity), 4) AS total
    FROM best_matches bm
    JOIN raw_materials rm ON rm.id = bm.raw_material_id
    LEFT JOIN material_categories mc ON mc.id = rm.category_id
    GROUP BY bm.raw_material_id, rm.name, bm.material_unit, mc.id, mc.name
  )
  SELECT COALESCE(
           jsonb_build_object(
             'materials', COALESCE(
               (
                 SELECT jsonb_object_agg(material_id::text,
                   jsonb_build_object(
                     'name', material_name,
                     'unit', unit,
                     'total', total,
                     'category_id', category_id,
                     'category_name', category_name
                   )
                 ) FROM material_totals
               ), '{}'::jsonb)
           ), '{}'::jsonb)
  INTO v_json;

  RETURN v_json;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper to refresh all purchase BOM consumption values (used by UI button)
CREATE OR REPLACE FUNCTION refresh_all_purchase_bom_consumption()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint := 0;
BEGIN
  UPDATE public.purchases p
  SET bom_consumption = compute_po_bom_consumption_json(p.id),
      updated_at = CURRENT_TIMESTAMP;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION refresh_all_purchase_bom_consumption() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_all_purchase_bom_consumption() TO authenticated;

-- 4) Trigger function to update purchases header after line changes
CREATE OR REPLACE FUNCTION trg_update_po_bom_consumption()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_id text;
BEGIN
  v_purchase_id := COALESCE(NEW.purchase_id, OLD.purchase_id);

  UPDATE public.purchases AS p
  SET bom_consumption = compute_po_bom_consumption_json(v_purchase_id),
      updated_at = CURRENT_TIMESTAMP
  WHERE p.id = v_purchase_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update purchases when normalized purchase_lines table changes
CREATE OR REPLACE FUNCTION trg_update_po_bom_consumption_from_purchase_lines()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_id text;
BEGIN
  v_purchase_id := COALESCE(NEW.purchase_id, OLD.purchase_id);
  IF v_purchase_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.purchases AS p
  SET bom_consumption = compute_po_bom_consumption_json(v_purchase_id),
      updated_at = CURRENT_TIMESTAMP
  WHERE p.id = v_purchase_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 5) Triggers on purchase order lines to keep header value in sync
DROP TRIGGER IF EXISTS trg_po_bom_consumption_insert ON public.purchase_lines;
CREATE TRIGGER trg_po_bom_consumption_insert
  AFTER INSERT ON public.purchase_lines
  FOR EACH ROW EXECUTE FUNCTION trg_update_po_bom_consumption();

DROP TRIGGER IF EXISTS trg_po_bom_consumption_update ON public.purchase_lines;
CREATE TRIGGER trg_po_bom_consumption_update
  AFTER UPDATE ON public.purchase_lines
  FOR EACH ROW EXECUTE FUNCTION trg_update_po_bom_consumption();

DROP TRIGGER IF EXISTS trg_po_bom_consumption_delete ON public.purchase_lines;
CREATE TRIGGER trg_po_bom_consumption_delete
  AFTER DELETE ON public.purchase_lines
  FOR EACH ROW EXECUTE FUNCTION trg_update_po_bom_consumption();

-- Additional triggers to cover purchase_lines table changes (normalized table)
DROP TRIGGER IF EXISTS trg_po_bom_consumption_pl_insert ON public.purchase_lines;
CREATE TRIGGER trg_po_bom_consumption_pl_insert
  AFTER INSERT ON public.purchase_lines
  FOR EACH ROW EXECUTE FUNCTION trg_update_po_bom_consumption_from_purchase_lines();

DROP TRIGGER IF EXISTS trg_po_bom_consumption_pl_update ON public.purchase_lines;
CREATE TRIGGER trg_po_bom_consumption_pl_update
  AFTER UPDATE ON public.purchase_lines
  FOR EACH ROW EXECUTE FUNCTION trg_update_po_bom_consumption_from_purchase_lines();

DROP TRIGGER IF EXISTS trg_po_bom_consumption_pl_delete ON public.purchase_lines;
CREATE TRIGGER trg_po_bom_consumption_pl_delete
  AFTER DELETE ON public.purchase_lines
  FOR EACH ROW EXECUTE FUNCTION trg_update_po_bom_consumption_from_purchase_lines();

-- 5b) Trigger on purchases when order_lines JSON changes
DROP TRIGGER IF EXISTS trg_po_bom_consumption_on_purchases ON public.purchases;
CREATE OR REPLACE FUNCTION trg_update_po_bom_consumption_on_purchases()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.purchases AS p
  SET bom_consumption = compute_po_bom_consumption_json(NEW.id),
      updated_at = CURRENT_TIMESTAMP
  WHERE p.id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_bom_consumption_on_purchases
  AFTER INSERT OR UPDATE OF order_lines ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION trg_update_po_bom_consumption_on_purchases();

-- 6) Backfill existing purchase orders
UPDATE public.purchases p
SET bom_consumption = compute_po_bom_consumption_json(p.id)
WHERE TRUE;
