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
  products?: {
    id: number;
    name: string;
    default_code: string | null;
    colour: string | null;
    size: string | null;
  }[];
}

export interface BOMLineConsumption {
  id: string;
  bom_line_id: string;
  attribute_type: 'size' | 'color' | 'general';
  attribute_value: string;
  quantity: number;
  unit: string;
  waste_percentage: number;
}

export interface BOMLineWithConsumptions extends BOMLineWithMaterial {
  consumptions?: BOMLineConsumption[];
}

export interface MultiBOMWithLines extends Omit<BOMHeader, 'product_id'> {
  lines: BOMLineWithConsumptions[];
  products: {
    id: number;
    name: string;
    default_code: string | null;
    colour: string | null;
    size: string | null;
  }[];
  product_ids: number[];
  bom_type: 'single' | 'multi';
}

export interface MaterialRequirement {
  raw_material_id: number;
  material_name: string;
  total_quantity: number;
  unit: string;
  cost_per_unit: number | null;
  total_cost: number;
}

export interface MultiProductBOMCreate {
  name: string;
  version: string;
  quantity: number;
  unit: string;
  description?: string;
  product_ids: number[];
  is_category_wise?: boolean;
  raw_materials: {
    raw_material_id: number;
    consumption_type: 'general' | 'size_wise' | 'color_wise' | 'category_wise';
    consumptions: {
      attribute_type: 'size' | 'color' | 'general' | 'category';
      attribute_value: string;
      quantity: number;
      unit: string;
      waste_percentage: number;
    }[];
    notes?: string;
  }[];
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

  // Multi-product BOM methods (simplified for current schema)
  async createMultiProductBOM(bomData: MultiProductBOMCreate): Promise<MultiBOMWithLines> {
    // For now, create a single BOM with aggregated information
    // This is a temporary solution until the migration is applied
    
    let enhancedName: string;
    let products: Array<{
      id: number;
      name: string;
      default_code: string | null;
      colour: string | null;
      size: string | null;
    }> = [];

    if (bomData.is_category_wise) {
      // Get category names for enhanced name
      const { data: categories } = await supabase
        .from('product_categories')
        .select('id, name')
        .in('id', bomData.product_ids);

      const categoryNames = categories?.map(c => c.name) || [];
      enhancedName = `${bomData.name} (Categories: ${categoryNames.slice(0, 3).join(', ')}${categoryNames.length > 3 ? ` +${categoryNames.length - 3} more` : ''})`; 
      
      // For category-wise BOMs, we store category info as mock products
      products = categories?.map(c => ({
        id: c.id,
        name: c.name,
        default_code: `CAT-${c.id}`,
        colour: null,
        size: null
      })) || [];
    } else {
      // Get product names for enhanced name
      const { data: productData } = await supabase
        .from('products')
        .select('id, name, default_code, colour, size')
        .in('id', bomData.product_ids);

      const productNames = productData?.map(p => p.name) || [];
      enhancedName = `${bomData.name} (${productNames.slice(0, 3).join(', ')}${productNames.length > 3 ? ` +${productNames.length - 3} more` : ''})`; 
      products = productData || [];
    }
    
    const { data: bomHeader, error: bomError } = await supabase
      .from('bom_headers')
      .insert({
        name: enhancedName,
        version: bomData.version,
        quantity: bomData.quantity,
        unit: bomData.unit,
        is_category_wise: bomData.is_category_wise || false,
        active: true
      })
      .select()
      .single();

    if (bomError) {
      console.error('Error creating multi-product BOM:', bomError);
      throw bomError;
    }

    // Create BOM lines with averaged/aggregated consumption data
    const lines: BOMLineWithConsumptions[] = [];
    for (const material of bomData.raw_materials) {
      // Calculate average consumption values from all variants
      const avgQuantity = material.consumptions.reduce((sum, c) => sum + c.quantity, 0) / material.consumptions.length;
      const avgWaste = material.consumptions.reduce((sum, c) => sum + c.waste_percentage, 0) / material.consumptions.length;
      
      // Create detailed notes with variant consumption info
      const variantDetails = material.consumptions.map(c => 
        bomData.is_category_wise 
          ? `Category ${c.attribute_value}: ${c.quantity} ${c.unit} (${c.waste_percentage}% waste)`
          : `${c.attribute_value}: ${c.quantity} ${c.unit} (${c.waste_percentage}% waste)`
      ).join('; ');
      
      const detailedNotes = `${material.notes ? material.notes + '. ' : ''}${bomData.is_category_wise ? 'Category' : 'Variant'} consumptions: ${variantDetails}`;

      const { data: bomLine, error: lineError } = await supabase
        .from('bom_lines')
        .insert({
          bom_header_id: bomHeader.id,
          raw_material_id: material.raw_material_id,
          quantity: avgQuantity,
          unit: material.consumptions[0]?.unit || 'pieces',
          waste_percentage: avgWaste,
          notes: detailedNotes
        })
        .select()
        .single();

      if (lineError) {
        console.error('Error creating BOM line:', lineError);
        throw lineError;
      }

      // Map consumption data for return (even though not stored separately)
      const consumptions: BOMLineConsumption[] = material.consumptions.map(c => ({
        id: `temp-${Math.random()}`,
        bom_line_id: bomLine.id,
        attribute_type: c.attribute_type,
        attribute_value: c.attribute_value,
        quantity: c.quantity,
        unit: c.unit,
        waste_percentage: c.waste_percentage,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      lines.push({
        ...bomLine,
        consumptions
      });
    }

    return {
      ...bomHeader,
      lines,
      products: products || [],
      product_ids: bomData.product_ids,
      bom_type: 'multi'
    } as MultiBOMWithLines;
  }

  async getUniqueColorsForProducts(productIds: number[]): Promise<string[]> {
    const { data, error } = await supabase
      .from('products')
      .select('colour')
      .in('id', productIds)
      .not('colour', 'is', null)
      .neq('colour', '');

    if (error) {
      console.error('Error fetching unique colors:', error);
      return [];
    }

    // Extract unique colors
    const uniqueColors = Array.from(new Set(data?.map(p => p.colour).filter(Boolean) || []));
    return uniqueColors.sort();
  }

  async getUniqueSizesForProducts(productIds: number[]): Promise<string[]> {
    const { data, error } = await supabase
      .from('products')
      .select('size')
      .in('id', productIds)
      .not('size', 'is', null)
      .neq('size', '');

    if (error) {
      console.error('Error fetching unique sizes:', error);
      return [];
    }

    // Extract unique sizes
    const uniqueSizes = Array.from(new Set(data?.map(p => p.size).filter(Boolean) || []));
    return uniqueSizes.sort();
  }

  async getProductsWithAttributes(productIds: number[]): Promise<{
    id: number;
    name: string;
    default_code: string | null;
    colour: string | null;
    size: string | null;
  }[]> {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, default_code, colour, size')
      .in('id', productIds)
      .eq('active', true)
      .order('name');
    
    if (error) {
      console.error('Error fetching products with attributes:', error);
      throw error;
    }
    
    return data || [];
  }

  async getAllProducts(): Promise<{
    id: number;
    name: string;
    default_code: string | null;
    colour: string | null;
    size: string | null;
  }[]> {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, default_code, colour, size')
      .eq('active', true)
      .order('name');
    
    if (error) {
      console.error('Error fetching all products:', error);
      throw error;
    }
    
    return data || [];
  }

  async getProductCategories(): Promise<{
    id: number;
    name: string;
    description?: string | null;
  }[]> {
    const { data, error } = await supabase
      .from('product_categories')
      .select('id, name, description')
      .order('name');
    
    if (error) {
      console.error('Error fetching product categories:', error);
      throw error;
    }
    
    return data || [];
  }

  async getProductsByCategory(categoryId: number): Promise<{
    id: number;
    name: string;
    default_code: string | null;
    colour: string | null;
    size: string | null;
    category_name?: string;
  }[]> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, default_code, colour, size,
        category:product_categories(name)
      `)
      .eq('category_id', categoryId)
      .eq('active', true)
      .order('name');
    
    if (error) {
      console.error('Error fetching products by category:', error);
      throw error;
    }
    
    return data?.map(product => ({
      ...product,
      category_name: product.category?.name
    })) || [];
  }

  async getCategoryWiseBOMs(): Promise<BOMWithLines[]> {
    const { data, error } = await supabase
      .from('bom_headers')
      .select(`
        *,
        lines:bom_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit, conversion_factor, cost_per_unit)
        )
      `)
      .eq('is_category_wise', true)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching category-wise BOMs:', error);
      throw error;
    }
    
    return (data || []).map(bom => ({
      ...bom,
      lines: (bom.lines || []).sort((a, b) => a.sort_order - b.sort_order)
    }));
  }

  async getBOMWithCategoryInfo(bomId: string): Promise<{
    bom: BOMWithLines;
    categories?: { id: number; name: string; }[];
  } | null> {
    const bom = await this.getBOMById(bomId);
    if (!bom) return null;

    if (bom.is_category_wise) {
      // Get all categories for category-wise BOMs
      const categories = await this.getProductCategories();
      return { bom, categories };
    }

    return { bom };
  }
}