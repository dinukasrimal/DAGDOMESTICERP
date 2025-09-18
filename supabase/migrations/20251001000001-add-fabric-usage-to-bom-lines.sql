-- Add fabric usage classification to BOM lines for fabric materials
ALTER TABLE bom_lines
  ADD COLUMN fabric_usage TEXT
  CHECK (
    fabric_usage IS NULL
    OR fabric_usage IN ('body', 'gusset_1', 'gusset_2')
  );

COMMENT ON COLUMN bom_lines.fabric_usage IS 'Fabric usage classification (body, gusset_1, gusset_2) applicable to fabric materials.';
