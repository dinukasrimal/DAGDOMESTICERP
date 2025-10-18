import { supabase } from '../integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '../integrations/supabase/types';
import type { PostgrestError } from '@supabase/supabase-js';

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
  material_category?: {
    id: number;
    name: string;
    description: string | null;
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

interface BomProductLink {
  bom_header_id: string;
  product_id: number;
}

type RawProductEntry = {
  id?: number;
  name?: string | null;
  default_code?: string | null;
  colour?: string | null;
  size?: string | null;
  product?: RawProductEntry;
};

type RawBomQuery = BOMHeader & {
  lines?: BOMLineWithMaterial[];
  products?: RawProductEntry[];
};

const normalizeBomProducts = (products: unknown): BOMWithLines['products'] => {
  if (!Array.isArray(products)) return [];

  const result: BOMWithLines['products'] = [];
  products.forEach((entry) => {
    const candidate = extractProduct(entry);
    if (candidate) {
      result.push(candidate);
    }
  });
  return result;
};

const extractProduct = (entry: unknown): BOMWithLines['products'][number] | null => {
  if (!entry || typeof entry !== 'object') return null;
  const raw = (entry as RawProductEntry).product ?? (entry as RawProductEntry);
  if (!raw || typeof raw !== 'object') return null;
  const { id, name, default_code, colour, size } = raw as RawProductEntry;
  if (typeof id !== 'number') return null;
  return {
    id,
    name: typeof name === 'string' ? name : '',
    default_code: default_code ?? null,
    colour: colour ?? null,
    size: size ?? null,
  };
};

export interface BOMLineConsumption {
  id: string;
  bom_line_id: string;
  attribute_type: 'size' | 'color' | 'general';
  attribute_value: string;
  quantity: number;
  unit: string;
  waste_percentage: number;
  product_id?: number | null;
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
      product_id?: number | null;
    }[];
    fabric_usage?: 'body' | 'gusset_1' | 'gusset_2' | null;
    notes?: string;
  }[];
}

export class BOMService {
  
  async getBOMsByProduct(productId: number): Promise<BOMWithLines[]> {
    console.log(`🔍 BOMService Debug: Looking for BOMs with product association = ${productId}`);

    const selectFields = `
      *,
      lines:bom_lines(
        *,
        raw_material:raw_materials(id, name, code, base_unit, purchase_unit, conversion_factor, cost_per_unit),
        material_category:material_categories(id, name, description)
      )
    `;

    const directResponse = await supabase
      .from('bom_headers')
      .select(selectFields)
      .contains('product_ids', [productId])
      .eq('active', true)
      .order('created_at', { ascending: false });

    let directBoms: RawBomQuery[] = [];

    if (directResponse.error) {
      const message = directResponse.error.message ?? '';
      if (message.includes('column') && message.includes('product_ids')) {
        const legacyResponse = await supabase
          .from('bom_headers')
          .select(selectFields)
          .eq('product_id', productId)
          .eq('active', true)
          .order('created_at', { ascending: false });

        if (legacyResponse.error) {
          console.error('Error fetching direct BOMs (legacy column):', legacyResponse.error);
          throw legacyResponse.error;
        }
        directBoms = (legacyResponse.data ?? []) as RawBomQuery[];
      } else {
        console.error('Error fetching direct BOMs:', directResponse.error);
        throw directResponse.error;
      }
    } else {
      directBoms = (directResponse.data ?? []) as RawBomQuery[];
    }

    const linkResponse = await supabase
      .from('bom_products')
      .select('bom_header_id, product_id')
      .eq('product_id', productId);

    let productLinks: BomProductLink[] = [];
    if (linkResponse.error) {
      const message = linkResponse.error.message ?? '';
      if (!message.includes('bom_products')) {
        console.error('Error fetching multi-product BOM links:', linkResponse.error);
        throw linkResponse.error;
      }
    } else {
      productLinks = (linkResponse.data ?? []) as BomProductLink[];
    }

    const multiBomIds = productLinks.map((link) => link.bom_header_id).filter(Boolean);

    let multiBoms: RawBomQuery[] = [];
    if (multiBomIds.length > 0) {
      const { data: multiData, error: multiError } = await supabase
        .from('bom_headers')
        .select(selectFields)
        .in('id', multiBomIds)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (multiError) {
        console.error('Error fetching multi-product BOMs:', multiError);
        throw multiError;
      }
      multiBoms = (multiData ?? []) as RawBomQuery[];
    }

    const combined: RawBomQuery[] = [...directBoms, ...multiBoms];

    const dedupedMap = new Map<string, RawBomQuery>();
    combined.forEach((bom) => {
      if (!bom || !bom.id) return;
      if (!dedupedMap.has(bom.id)) {
        dedupedMap.set(bom.id, bom);
      }
    });

    const productsByBom = new Map<string, RawProductEntry[]>();
    if (productLinks.length > 0) {
      const uniqueProductIds = Array.from(new Set(productLinks.map((link) => link.product_id).filter((id) => id != null))) as number[];
      let productDetailsMap = new Map<number, RawProductEntry>();
      if (uniqueProductIds.length > 0) {
        const { data: productDetails, error: productError } = await supabase
          .from('products')
          .select('id, name, default_code, colour, size')
          .in('id', uniqueProductIds);

        if (!productError && Array.isArray(productDetails)) {
          productDetailsMap = new Map(productDetails.map((prod) => [prod.id, prod]));
        }
      }

      productLinks.forEach((link) => {
        const list = productsByBom.get(link.bom_header_id) ?? [];
        const productDetail = productDetailsMap.get(link.product_id);
        if (productDetail) {
          list.push(productDetail);
        } else {
          list.push({ id: link.product_id });
        }
        productsByBom.set(link.bom_header_id, list);
      });
    }

    const processedData = Array.from(dedupedMap.values()).map((bom) => {
      const sortedLines = Array.isArray(bom.lines) ? [...bom.lines].sort((a, b) => a.sort_order - b.sort_order) : [];
      const headerProductIds = Array.isArray((bom as any).product_ids) ? ((bom as any).product_ids as number[]) : [];
      const extraProducts: RawProductEntry[] = [];
      headerProductIds.forEach((id) => {
        const existing = extraProducts.find((product) => product.id === id);
        if (!existing) {
          extraProducts.push({ id });
        }
      });

      const normalizedProducts = normalizeBomProducts([
        ...(productsByBom.get(bom.id) ?? []),
        ...extraProducts,
      ]);

      return {
        ...bom,
        lines: sortedLines,
        products: normalizedProducts,
      } satisfies BOMWithLines;
    });

    console.log(`✅ BOMService Debug: Found ${processedData.length} BOMs (including multi-product) for product ${productId}`);
    return processedData;
  }

  async getAllBOMs(): Promise<BOMWithLines[]> {
    const { data, error } = await supabase
      .from('bom_headers')
      .select(`
        *,
        lines:bom_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit, conversion_factor, cost_per_unit),
          material_category:material_categories(id, name, description)
        )
      `)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all BOMs:', error);
      throw error;
    }
    
    // For each BOM, check if it's category-wise and handle product relationships accordingly
    const bomsWithProducts = await Promise.all((data || []).map(async (bom) => {
      let product = null;
      
      // Only try to fetch product for single-product BOMs (non-category-wise with product_id)
      if (!bom.is_category_wise && bom.product_id) {
        const { data: productData } = await supabase
          .from('products')
          .select('id, name, default_code')
          .eq('id', bom.product_id)
          .single();
        
        product = productData;
      }
      
      return {
        ...bom,
        product,
        lines: (bom.lines || []).sort((a, b) => a.sort_order - b.sort_order)
      };
    }));
    
    return bomsWithProducts;
  }

  async getBOMById(bomId: string): Promise<BOMWithLines | null> {
    const { data, error } = await supabase
      .from('bom_headers')
      .select(`
        *,
        lines:bom_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit, conversion_factor, cost_per_unit),
          material_category:material_categories(id, name, description)
        )
      `)
      .eq('id', bomId)
      .single();

    if (error) {
      console.error('Error fetching BOM:', error);
      throw error;
    }
    
    if (!data) return null;
    
    let product = null;
    
    // Only try to fetch product for single-product BOMs (non-category-wise with product_id)
    if (!data.is_category_wise && data.product_id) {
      const { data: productData } = await supabase
        .from('products')
        .select('id, name, default_code')
        .eq('id', data.product_id)
        .single();
      
      product = productData;
    }
    
    return {
      ...data,
      product,
      lines: (data.lines || []).sort((a, b) => a.sort_order - b.sort_order)
    };
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
        fabric_usage: line.fabric_usage || null,
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
      // Category-wise: still tied to selected products; reflect product names in BOM name
      const { data: productData } = await supabase
        .from('products')
        .select('id, name, default_code, colour, size')
        .in('id', bomData.product_ids);
      const productNames = productData?.map(p => p.name) || [];
      enhancedName = `${bomData.name} (${productNames.slice(0, 3).join(', ')}${productNames.length > 3 ? ` +${productNames.length - 3} more` : ''})`;
      products = productData || [];
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
    
    const supportsMultiSchemaErrorCodes = ['PGRST204', '42703'];
    const isMissingColumnError = (error: PostgrestError | null | undefined, columnName: string) => {
      if (!error) return false;
      if (supportsMultiSchemaErrorCodes.includes(error.code ?? '')) return true;
      const message = (error.message || '').toLowerCase();
      return message.includes(`'${columnName.toLowerCase()}'`) || message.includes('column') && message.includes(columnName.toLowerCase());
    };

    let bomHeader: BOMHeader | null = null;
    let schemaSupportsMultiColumns = true;

    const primaryInsertPayload: Record<string, any> = {
      name: enhancedName,
      version: bomData.version,
      quantity: bomData.quantity,
      unit: bomData.unit,
      is_category_wise: bomData.is_category_wise || false,
      active: true,
      product_ids: bomData.product_ids,
      bom_type: 'multi',
      description: bomData.description ?? null,
    };

    const { data: bomHeaderPrimary, error: bomErrorPrimary } = await supabase
      .from('bom_headers')
      .insert(primaryInsertPayload)
      .select()
      .single();

    if (bomErrorPrimary) {
      const missingProductIds = isMissingColumnError(bomErrorPrimary, 'product_ids');
      const missingBomType = isMissingColumnError(bomErrorPrimary, 'bom_type');
      const missingDescription = isMissingColumnError(bomErrorPrimary, 'description');

      if (missingProductIds || missingBomType || missingDescription) {
        schemaSupportsMultiColumns = false;
        const legacyPayload: Record<string, any> = {
          name: enhancedName,
          version: bomData.version,
          quantity: bomData.quantity,
          unit: bomData.unit,
          is_category_wise: bomData.is_category_wise || false,
          active: true,
        };

        if (bomData.product_ids.length > 0) {
          legacyPayload.product_id = bomData.product_ids[0];
        }

        const { data: bomHeaderLegacy, error: bomErrorLegacy } = await supabase
          .from('bom_headers')
          .insert(legacyPayload)
          .select()
          .single();

        if (bomErrorLegacy) {
          console.error('Error creating multi-product BOM (legacy fallback failed):', bomErrorLegacy);
          throw bomErrorLegacy;
        }

        bomHeader = bomHeaderLegacy;
      } else {
        console.error('Error creating multi-product BOM:', bomErrorPrimary);
        throw bomErrorPrimary;
      }
    } else {
      bomHeader = bomHeaderPrimary;
    }

    if (bomHeader && schemaSupportsMultiColumns && Array.isArray(bomData.product_ids) && bomData.product_ids.length > 0) {
      const { error: productLinkError } = await supabase
        .from('bom_products')
        .insert(bomData.product_ids.map(id => ({ bom_header_id: bomHeader.id, product_id: id })))
        .select();
      if (productLinkError) {
        const tableMissing = productLinkError.code === 'PGRST200' || productLinkError.code === '42P01' || (productLinkError.message || '').toLowerCase().includes('bom_products');
        if (!tableMissing) {
          console.warn('Warning: failed to link products to multi-product BOM', productLinkError.message);
        }
      }
    }

    // Create BOM lines with averaged/aggregated consumption data
    const lines: BOMLineWithConsumptions[] = [];
    for (const material of bomData.raw_materials) {
      // Calculate average consumption values from all variants
      const avgQuantity = material.consumptions.reduce((sum, c) => sum + c.quantity, 0) / material.consumptions.length;
      const avgWaste = material.consumptions.reduce((sum, c) => sum + c.waste_percentage, 0) / material.consumptions.length;
      
      // Create detailed notes with variant consumption info (include product_id for reliable matching)
      const variantDetailsPayload = material.consumptions.map(c => ({
        product_id: c.product_id ?? null,
        label: c.attribute_value,
        quantity: c.quantity,
        unit: c.unit,
        waste_percentage: c.waste_percentage,
      }));

      const variantDetailsJson = JSON.stringify(variantDetailsPayload);
      const detailedNotes = `${material.notes ? material.notes + '. ' : ''}Variant consumptions: ${variantDetailsJson}`;

      // For category-wise BOMs with negative raw_material_id, we need to handle this specially
      let rawMaterialId = material.raw_material_id;
      
      // If it's a category entry (negative ID), we'll store it as a special entry
      // but we need a valid raw_material_id for the database. We'll use the notes to identify categories.
      if (bomData.is_category_wise && material.raw_material_id < 0) {
        // For category entries, we'll create a placeholder entry
        // The category information is stored in the notes
        rawMaterialId = 1; // Use first available material as placeholder - this is just for database constraint
      }

      const { data: bomLine, error: lineError } = await supabase
        .from('bom_lines')
        .insert({
          bom_header_id: bomHeader.id,
          raw_material_id: rawMaterialId,
          quantity: avgQuantity,
          unit: material.consumptions[0]?.unit || 'pieces',
          waste_percentage: avgWaste,
          fabric_usage: material.fabric_usage || null,
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
        product_id: c.product_id ?? null,
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
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit, conversion_factor, cost_per_unit),
          material_category:material_categories(id, name, description)
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
