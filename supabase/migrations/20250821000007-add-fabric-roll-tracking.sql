-- Add fabric roll tracking fields to goods received lines
ALTER TABLE goods_received_lines 
ADD COLUMN roll_barcode VARCHAR(100),
ADD COLUMN roll_weight DECIMAL(10,2),
ADD COLUMN roll_length DECIMAL(10,2);

-- Create index for barcode lookups
CREATE INDEX idx_goods_received_lines_barcode ON goods_received_lines(roll_barcode);

-- Add constraint to ensure roll_barcode is unique per GRN
ALTER TABLE goods_received_lines 
ADD CONSTRAINT unique_barcode_per_grn UNIQUE (goods_received_id, roll_barcode);