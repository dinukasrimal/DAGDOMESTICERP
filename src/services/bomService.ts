import { supabase } from '../integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '../integrations/supabase/types';

export type BOMHeader = Tables<'bom_headers'>;
export type BOMHeaderInsert = TablesInsert<'bom_headers'>;
export type BOMHeaderUpdate = TablesUpdate<'bom_headers'>;

export type BOMLine = Tables<'bom_lines'>;
export type BOMLineInsert = TablesInsert<'bom_lines'>;
export type BOMLineUpdate = TablesUpdate<'bom_lines'>;

export interface BOMLineWithMaterial extends BOMLine {
  raw_material?: {
    id: number;
    name: string;
    code: string | null;
    base_unit: string;
    purchase_unit: string;
    conversion_factor: number;
    cost_per_unit: number | null;
  };
}

export interface BOMWithLines extends BOMHeader {
  lines: BOMLineWithMaterial[];
  product?: {
    id: number;
    name: string;
    default_code: string | null;
  };
}

export interface MaterialRequirement {
  raw_material_id: number;
  material_name: string;
  total_quantity: number;
  unit: string;
  cost_per_unit: number | null;
  total_cost: number;
}

export class BOMService {
  
  async getBOMsByProduct(productId: number): Promise<BOMWithLines[]> {
    const { data, error } = await supabase
      .from('bom_headers')
      .select(`
        *,
        product:products(id, name, default_code),
        lines:bom_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit, conversion_factor, cost_per_unit)
        )
      `)
      .eq('product_id', productId)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching BOMs:', error);
      throw error;
    }
    
    return (data || []).map(bom => ({
      ...bom,
      product: Array.isArray(bom.product) ? bom.product[0] : bom.product,
      lines: (bom.lines || []).sort((a, b) => a.sort_order - b.sort_order)
    }));
  }

  async getAllBOMs(): Promise<BOMWithLines[]> {
    const { data, error } = await supabase
      .from('bom_headers')
      .select(`
        *,
        product:products(id, name, default_code),
        lines:bom_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit, conversion_factor, cost_per_unit)
        )
      `)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all BOMs:', error);
      throw error;
    }
    
    return (data || []).map(bom => ({
      ...bom,
      product: Array.isArray(bom.product) ? bom.product[0] : bom.product,
      lines: (bom.lines || []).sort((a, b) => a.sort_order - b.sort_order)
    }));
  }

  async getBOMById(bomId: string): Promise<BOMWithLines | null> {
    const { data, error } = await supabase
      .from('bom_headers')
      .select(`
        *,
        product:products(id, name, default_code),
        lines:bom_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit, conversion_factor, cost_per_unit)
        )
      `)
      .eq('id', bomId)
      .single();

    if (error) {
      console.error('Error fetching BOM:', error);
      throw error;
    }
    
    return data ? {
      ...data,
      product: Array.isArray(data.product) ? data.product[0] : data.product,
      lines: (data.lines || []).sort((a, b) => a.sort_order - b.sort_order)
    } : null;
  }

  async createBOM(bom: BOMHeaderInsert): Promise<BOMHeader> {
    const { data, error } = await supabase
      .from('bom_headers')
      .insert([bom])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating BOM:', error);
      throw error;
    }
    
    return data;
  }

  async updateBOM(bomId: string, updates: BOMHeaderUpdate): Promise<BOMHeader> {
    const { data, error } = await supabase
      .from('bom_headers')
      .update(updates)
      .eq('id', bomId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating BOM:', error);
      throw error;
    }
    
    return data;
  }

  async deleteBOM(bomId: string): Promise<void> {
    const { error } = await supabase
      .from('bom_headers')
      .update({ active: false })
      .eq('id', bomId);
    
    if (error) {
      console.error('Error deactivating BOM:', error);
      throw error;
    }
  }

  async copyBOM(sourceBOMId: string, targetProductId: number, newName: string): Promise<BOMWithLines> {
    const sourceBOM = await this.getBOMById(sourceBOMId);
    
    if (!sourceBOM) {
      throw new Error('Source BOM not found');
    }

    const newBOMHeader = await this.createBOM({
      product_id: targetProductId,
      name: newName,
      version: '1.0',
      quantity: sourceBOM.quantity,
      unit: sourceBOM.unit
    });

    const newLines: BOMLineWithMaterial[] = [];
    for (const line of sourceBOM.lines) {
      const newLine = await this.addBOMLine(newBOMHeader.id, {
        raw_material_id: line.raw_material_id,
        quantity: line.quantity,
        unit: line.unit,
        waste_percentage: line.waste_percentage,
        notes: line.notes,
        sort_order: line.sort_order
      });
      newLines.push({ ...newLine, raw_material: line.raw_material });
    }

    return {
      ...newBOMHeader,
      lines: newLines
    };
  }

  async addBOMLine(bomHeaderId: string, line: Omit<BOMLineInsert, 'bom_header_id'>): Promise<BOMLine> {
    const { data, error } = await supabase
      .from('bom_lines')
      .insert([{ ...line, bom_header_id: bomHeaderId }])
      .select()
      .single();
    
    if (error) {
      console.error('Error adding BOM line:', error);
      throw error;
    }
    
    return data;
  }

  async updateBOMLine(lineId: string, updates: BOMLineUpdate): Promise<BOMLine> {
    const { data, error } = await supabase
      .from('bom_lines')
      .update(updates)
      .eq('id', lineId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating BOM line:', error);
      throw error;
    }
    
    return data;
  }

  async deleteBOMLine(lineId: string): Promise<void> {
    const { error } = await supabase
      .from('bom_lines')
      .delete()
      .eq('id', lineId);
    
    if (error) {
      console.error('Error deleting BOM line:', error);
      throw error;
    }
  }

  async calculateMaterialRequirements(bomId: string, productionQuantity: number): Promise<MaterialRequirement[]> {
    const bom = await this.getBOMById(bomId);
    
    if (!bom) {
      throw new Error('BOM not found');
    }

    const materialTotals = new Map<number, MaterialRequirement>();

    for (const line of bom.lines) {
      if (!line.raw_material) continue;

      const quantityPerUnit = line.quantity * (1 + line.waste_percentage / 100);
      const totalQuantity = quantityPerUnit * productionQuantity / bom.quantity;
      const totalCost = (line.raw_material.cost_per_unit || 0) * totalQuantity;

      const materialId = line.raw_material.id;
      
      if (materialTotals.has(materialId)) {
        const existing = materialTotals.get(materialId)!;
        existing.total_quantity += totalQuantity;
        existing.total_cost += totalCost;
      } else {
        materialTotals.set(materialId, {
          raw_material_id: materialId,
          material_name: line.raw_material.name,
          total_quantity: totalQuantity,
          unit: line.unit,
          cost_per_unit: line.raw_material.cost_per_unit,
          total_cost: totalCost
        });
      }
    }

    return Array.from(materialTotals.values());
  }
}