-- Add roll barcode to inventory layers so barcode-wise stock can be read from inventory
ALTER TABLE raw_material_inventory
ADD COLUMN IF NOT EXISTS roll_barcode VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_raw_material_inventory_roll_barcode
ON raw_material_inventory(roll_barcode);

