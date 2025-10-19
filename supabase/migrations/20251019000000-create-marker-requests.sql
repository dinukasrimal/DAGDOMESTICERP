-- Create marker_requests table used by Marker Requests, Goods Issue, and Returns
CREATE TABLE IF NOT EXISTS marker_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marker_number VARCHAR(50) UNIQUE NOT NULL,
  marker_type VARCHAR(20) NOT NULL CHECK (marker_type IN ('body','gusset')),
  width DECIMAL(10,2) NOT NULL DEFAULT 0,
  layers INTEGER NOT NULL DEFAULT 1,
  efficiency DECIMAL(5,2) NOT NULL DEFAULT 0,
  pieces_per_marker DECIMAL(10,2) NOT NULL DEFAULT 0,
  marker_length_yards DECIMAL(10,2) NOT NULL DEFAULT 0,
  marker_length_inches DECIMAL(10,2) NOT NULL DEFAULT 0,
  measurement_type VARCHAR(10) NOT NULL DEFAULT 'yard' CHECK (measurement_type IN ('yard','kg')),
  marker_gsm DECIMAL(10,2),
  total_fabric_yards DECIMAL(12,3),
  total_fabric_kg DECIMAL(12,3),
  po_ids TEXT[] NOT NULL DEFAULT '{}',
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and allow authenticated users CRUD (tune as needed)
ALTER TABLE marker_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marker_requests_select" ON marker_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "marker_requests_insert" ON marker_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "marker_requests_update" ON marker_requests FOR UPDATE TO authenticated USING (true);
CREATE POLICY "marker_requests_delete" ON marker_requests FOR DELETE TO authenticated USING (true);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_marker_requests_number ON marker_requests(marker_number);
CREATE INDEX IF NOT EXISTS idx_marker_requests_created ON marker_requests(created_at);

