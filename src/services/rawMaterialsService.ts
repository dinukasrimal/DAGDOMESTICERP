import { supabase } from '../integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '../integrations/supabase/types';

export type RawMaterial = Tables<'raw_materials'>;
export type RawMaterialInsert = TablesInsert<'raw_materials'>;
export type RawMaterialUpdate = TablesUpdate<'raw_materials'>;

export type RawMaterialInventory = Tables<'raw_material_inventory'>;
export type RawMaterialInventoryInsert = TablesInsert<'raw_material_inventory'>;
export type RawMaterialInventoryUpdate = TablesUpdate<'raw_material_inventory'>;

export type MaterialCategory = Tables<'material_categories'>;
export type MaterialCategoryInsert = TablesInsert<'material_categories'>;
export type MaterialCategoryUpdate = TablesUpdate<'material_categories'>;

export type MaterialSupplier = Tables<'material_suppliers'>;
export type MaterialSupplierInsert = TablesInsert<'material_suppliers'>;
export type MaterialSupplierUpdate = TablesUpdate<'material_suppliers'>;

export interface RawMaterialWithInventory extends RawMaterial {
  inventory?: RawMaterialInventory;
  category?: MaterialCategory;
  supplier?: MaterialSupplier;
}

export class RawMaterialsService {
  async getInventoryValuation(materialIds: number[]): Promise<Record<number, { totalQty: number; totalValue: number; avgCost: number }>> {
    const result: Record<number, { totalQty: number; totalValue: number; avgCost: number }> = {};
    if (!materialIds || materialIds.length === 0) return result;
    try {
      // Primary: compute from raw_material_inventory layers (quantity * unit_cost)
      const { data: invRows } = await supabase
        .from('raw_material_inventory')
        .select('raw_material_id, quantity_available, quantity_on_hand, unit_price, inventory_value')
        .in('raw_material_id', materialIds);
      const agg = new Map<number, { qty: number; value: number }>();
      for (const r of invRows || []) {
        const id = Number((r as any).raw_material_id);
        const qty = Number((r as any).quantity_available ?? (r as any).quantity_on_hand ?? 0);
        const invVal = (r as any).inventory_value;
        const unitPrice = (r as any).unit_price;
        const value = invVal != null ? Number(invVal) : qty * Number(unitPrice ?? 0);
        if (qty <= 0) continue;
        const prev = agg.get(id) || { qty: 0, value: 0 };
        agg.set(id, { qty: prev.qty + qty, value: prev.value + value });
      }
      agg.forEach((v, k) => {
        result[k] = { totalQty: v.qty, totalValue: v.value, avgCost: v.qty > 0 ? v.value / v.qty : 0 };
      });

      // Fallback for materials without valued layers
      const missingIds = materialIds.filter(id => !result[id] || result[id].totalQty === 0 || result[id].totalValue === 0);
      if (missingIds.length) {
        // Get current inventory quantities for missing ids (sum across rows)
        const { data: invTotalsRows } = await supabase
          .from('raw_material_inventory')
          .select('raw_material_id, quantity_available, quantity_on_hand, quantity')
          .in('raw_material_id', missingIds);
        const invMap = new Map<number, number>();
        for (const r of invTotalsRows || []) {
          const id = Number((r as any).raw_material_id);
          const qty = Number((r as any).quantity_available ?? (r as any).quantity_on_hand ?? (r as any).quantity ?? 0);
          invMap.set(id, (invMap.get(id) || 0) + qty);
        }

        // Weighted average unit_price from posted GRNs
        const { data: grnLines } = await supabase
          .from('goods_received_lines')
          .select('raw_material_id, quantity_received, unit_price, goods_received_id')
          .in('raw_material_id', missingIds);

        let postedMap = new Map<number, { qty: number; value: number }>();
        if (grnLines && grnLines.length) {
          const grnIds = Array.from(new Set(grnLines.map((l: any) => l.goods_received_id).filter(Boolean)));
          let postedSet = new Set<string>();
          if (grnIds.length) {
            const { data: posted } = await supabase
              .from('goods_received')
              .select('id, status')
              .in('id', grnIds);
            postedSet = new Set((posted || []).filter((r: any) => r.status === 'posted').map((r: any) => r.id));
          }
          for (const l of grnLines) {
            if (!postedSet.has((l as any).goods_received_id)) continue;
            const id = Number((l as any).raw_material_id);
            const qty = Number((l as any).quantity_received || 0);
            const price = Number((l as any).unit_price || 0);
            const prev = postedMap.get(id) || { qty: 0, value: 0 };
            postedMap.set(id, { qty: prev.qty + qty, value: prev.value + qty * price });
          }
        }

        for (const id of missingIds) {
          const invQty = invMap.get(id) || 0;
          const postedAgg = postedMap.get(id) || { qty: 0, value: 0 };
          if (invQty > 0 && postedAgg.qty > 0) {
            const avg = postedAgg.value / postedAgg.qty;
            result[id] = { totalQty: invQty, totalValue: invQty * avg, avgCost: avg };
          }
        }
      }
    } catch (err) {
      console.warn('Failed to compute inventory valuation:', err);
    }
    return result;
  }
  private async buildFromInventory(activeOnly: boolean): Promise<RawMaterialWithInventory[]> {
    // Load inventory rows, then fetch material info and compose
    const { data: invRows, error: invErr } = await supabase
      .from('raw_material_inventory')
      .select('raw_material_id, quantity_on_hand, quantity_available, quantity_reserved, location, last_updated');
    if (invErr) {
      console.error('Error fetching inventory (fallback):', invErr);
      return [];
    }

    const ids = Array.from(new Set((invRows || []).map(r => r.raw_material_id).filter(Boolean))) as number[];
    let materials: any[] = [];
    if (ids.length) {
      // Try plural table first
      const { data: matsPlural, error: matsPluralErr } = await supabase
        .from('raw_materials')
        .select('*')
        .in('id', ids)
        .order('name');
      if (!matsPluralErr && matsPlural) {
        materials = matsPlural as any[];
      } else {
        // Fallback to singular table name
        const { data: matsSingular } = await supabase
          .from('raw_material')
          .select('*')
          .in('id', ids)
          .order('name');
        materials = matsSingular as any[] || [];
      }
    }

    // Optional active filter
    const filtered = activeOnly ? materials.filter(m => m.active !== false) : materials;

    // Aggregate multiple inventory rows per material (sum quantities)
    const invAgg = new Map<number, any>();
    for (const r of invRows || []) {
      if (!r?.raw_material_id) continue;
      const key = r.raw_material_id as number;
      const prev = invAgg.get(key) || { raw_material_id: key, quantity_on_hand: 0, quantity_available: 0, quantity_reserved: 0, location: r.location || 'Default Warehouse', last_updated: r.last_updated };
      invAgg.set(key, {
        ...prev,
        quantity_on_hand: Number(prev.quantity_on_hand) + Number(r.quantity_on_hand || 0),
        quantity_available: Number(prev.quantity_available) + Number(r.quantity_available || 0),
        quantity_reserved: Number(prev.quantity_reserved) + Number(r.quantity_reserved || 0),
        // Keep latest last_updated
        last_updated: (prev.last_updated && r.last_updated && prev.last_updated > r.last_updated) ? prev.last_updated : r.last_updated,
      });
    }
    return filtered.map(m => ({
      ...m,
      inventory: invAgg.get(m.id) || null,
    }));
  }
  
  async getRawMaterials(activeOnly: boolean = true): Promise<RawMaterialWithInventory[]> {
    try {
      let query = supabase
        .from('raw_materials')
        .select(`
          *,
          inventory:raw_material_inventory(*),
          category:material_categories(*),
          supplier:material_suppliers(*)
        `)
        .order('name');

      if (activeOnly) query = query.eq('active', true);

      const { data, error } = await query;
      if (error) throw error;

      const aggregateInventoryArray = (arr: any[]) => {
        const onlyGrn = (arr || []).filter((r: any) => !r?.transaction_type || r.transaction_type === 'grn');
        const acc = { quantity_on_hand: 0, quantity_available: 0, quantity_reserved: 0 } as any;
        let location: string | null = null;
        let last_updated: string | null = null;
        for (const r of onlyGrn) {
          acc.quantity_on_hand += Number(r?.quantity_on_hand || 0);
          acc.quantity_available += Number(r?.quantity_available || 0);
          acc.quantity_reserved += Number(r?.quantity_reserved || 0);
          location = location || r?.location || 'Default Warehouse';
          if (!last_updated || (r?.last_updated && r.last_updated > last_updated)) last_updated = r.last_updated;
        }
        return onlyGrn && onlyGrn.length ? { ...acc, location, last_updated } : null;
      };

      let rows = (data || []).map((material: any) => {
        const inv = Array.isArray(material.inventory)
          ? aggregateInventoryArray(material.inventory)
          : material.inventory;
        const category = Array.isArray(material.category) ? material.category[0] : material.category;
        const supplier = Array.isArray(material.supplier) ? material.supplier[0] : material.supplier;
        return { ...material, inventory: inv, category, supplier };
      });
      
      // For any materials missing inventory from the join, backfill directly from inventory table
      const missingIds = rows.filter(r => !r.inventory).map(r => r.id);
      if (missingIds.length) {
        const { data: invRows } = await supabase
          .from('raw_material_inventory')
          .select('*')
          .in('raw_material_id', missingIds)
          .or('transaction_type.is.null,transaction_type.eq.grn');
        // Aggregate as above
        const agg = new Map<number, any>();
        for (const r of (invRows || [])) {
          if (!r?.raw_material_id) continue;
          const key = r.raw_material_id as number;
          const prev = agg.get(key) || { raw_material_id: key, quantity_on_hand: 0, quantity_available: 0, quantity_reserved: 0, location: r.location || 'Default Warehouse', last_updated: r.last_updated };
          agg.set(key, {
            ...prev,
            quantity_on_hand: Number(prev.quantity_on_hand) + Number(r.quantity_on_hand || 0),
            quantity_available: Number(prev.quantity_available) + Number(r.quantity_available || 0),
            quantity_reserved: Number(prev.quantity_reserved) + Number(r.quantity_reserved || 0),
            last_updated: (prev.last_updated && r.last_updated && prev.last_updated > r.last_updated) ? prev.last_updated : r.last_updated,
          });
        }
        rows = rows.map(r => r.inventory ? r : { ...r, inventory: agg.get(r.id) || null });
      }

      // If still nobody has inventory, fallback to inventory-first build
      const hasAnyInventory = rows.some((r: any) => r.inventory);
      if (!hasAnyInventory) {
        const fallback = await this.buildFromInventory(activeOnly);
        if (fallback.length) return fallback as any;
      }

      return rows as any;
    } catch (err) {
      // Fallback to inventory-first (and possibly singular material table name)
      console.warn('Primary materials query failed; falling back to inventory-first:', err);
      return this.buildFromInventory(activeOnly);
    }
  }

  async getRawMaterialById(id: number): Promise<RawMaterialWithInventory | null> {
    try {
      const { data, error } = await supabase
        .from('raw_materials')
        .select(`
          *,
          inventory:raw_material_inventory(*),
          category:material_categories(*),
          supplier:material_suppliers(*)
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data ? {
        ...data,
        inventory: Array.isArray((data as any).inventory) ? (data as any).inventory[0] : (data as any).inventory,
        category: Array.isArray((data as any).category) ? (data as any).category[0] : (data as any).category,
        supplier: Array.isArray((data as any).supplier) ? (data as any).supplier[0] : (data as any).supplier
      } as any : null;
    } catch (err) {
      // Fallback: compose from inventory + singular table name
      const inv = await this.getInventoryByMaterial(id);
      if (!inv) return null;
      const { data: matPlural } = await supabase.from('raw_materials').select('*').eq('id', id).maybeSingle();
      let mat: any = matPlural;
      if (!mat) {
        const { data: matSing } = await supabase.from('raw_material').select('*').eq('id', id).maybeSingle();
        mat = matSing;
      }
      if (!mat) return null;
      return { ...mat, inventory: inv } as any;
    }
  }

  async createRawMaterial(material: RawMaterialInsert): Promise<RawMaterial> {
    const { data, error } = await supabase
      .from('raw_materials')
      .insert([material])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating raw material:', error);
      throw error;
    }
    
    // Create initial inventory record
    if (data) {
      await this.createInventoryRecord(data.id, {
        raw_material_id: data.id,
        quantity_on_hand: 0,
        quantity_available: 0,
        quantity_reserved: 0,
        location: 'Default'
      });
    }
    
    return data;
  }

  async updateRawMaterial(id: number, updates: RawMaterialUpdate): Promise<RawMaterial> {
    const { data, error } = await supabase
      .from('raw_materials')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating raw material:', error);
      throw error;
    }
    
    return data;
  }

  async deleteRawMaterial(id: number): Promise<void> {
    const { error } = await supabase
      .from('raw_materials')
      .update({ active: false })
      .eq('id', id);
    
    if (error) {
      console.error('Error deactivating raw material:', error);
      throw error;
    }
  }

  async searchRawMaterials(searchTerm: string): Promise<RawMaterialWithInventory[]> {
    const { data, error } = await supabase
      .from('raw_materials')
      .select(`
        *,
        inventory:raw_material_inventory(*)
      `)
      .eq('active', true)
      .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .order('name');

    if (error) {
      console.error('Error searching raw materials:', error);
      throw error;
    }
    
    return (data || []).map(material => ({
      ...material,
      inventory: Array.isArray(material.inventory) ? material.inventory[0] : material.inventory
    }));
  }

  // Inventory management methods
  async getInventoryByMaterial(materialId: number): Promise<RawMaterialInventory | null> {
    const { data, error } = await supabase
      .from('raw_material_inventory')
      .select('*')
      .eq('raw_material_id', materialId);
    if (error) {
      console.error('Error fetching inventory:', error);
      throw error;
    }
    const rows = data || [];
    if (!rows.length) return null;
    // Aggregate across rows
    const agg = rows.reduce(
      (acc: any, r: any) => {
        const qh = Number(r.quantity_on_hand ?? r.quantity ?? 0);
        const qa = Number(r.quantity_available ?? r.quantity ?? 0);
        const qr = Number(r.quantity_reserved ?? 0);
        acc.quantity_on_hand += qh;
        acc.quantity_available += qa;
        acc.quantity_reserved += qr;
        acc.location = acc.location || r.location || 'Default Warehouse';
        acc.last_updated = !acc.last_updated || (r.last_updated && r.last_updated > acc.last_updated) ? r.last_updated : acc.last_updated;
        acc.raw_material_id = materialId;
        return acc;
      },
      { quantity_on_hand: 0, quantity_available: 0, quantity_reserved: 0, location: null as any, last_updated: null as any, raw_material_id: materialId }
    );
    return agg as RawMaterialInventory;
  }

  async createInventoryRecord(materialId: number, inventory: Omit<RawMaterialInventoryInsert, 'raw_material_id'>): Promise<RawMaterialInventory> {
    const { data, error } = await supabase
      .from('raw_material_inventory')
      .insert([{ ...inventory, raw_material_id: materialId }])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating inventory record:', error);
      throw error;
    }
    
    return data;
  }

  async updateInventory(materialId: number, updates: RawMaterialInventoryUpdate): Promise<RawMaterialInventory> {
    const { data, error } = await supabase
      .from('raw_material_inventory')
      .update({ ...updates, last_updated: new Date().toISOString() })
      .eq('raw_material_id', materialId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating inventory:', error);
      throw error;
    }
    
    return data;
  }

  async adjustStock(materialId: number, quantityChange: number, reason?: string): Promise<RawMaterialInventory> {
    const currentInventory = await this.getInventoryByMaterial(materialId);
    
    if (!currentInventory) {
      throw new Error('Inventory record not found');
    }

    const newQuantityOnHand = currentInventory.quantity_on_hand + quantityChange;
    const newQuantityAvailable = Math.max(0, newQuantityOnHand - currentInventory.quantity_reserved);

    return this.updateInventory(materialId, {
      quantity_on_hand: newQuantityOnHand,
      quantity_available: newQuantityAvailable
    });
  }

  async reserveStock(materialId: number, quantity: number): Promise<RawMaterialInventory> {
    const currentInventory = await this.getInventoryByMaterial(materialId);
    
    if (!currentInventory) {
      throw new Error('Inventory record not found');
    }

    if (currentInventory.quantity_available < quantity) {
      throw new Error('Insufficient stock available for reservation');
    }

    const newQuantityReserved = currentInventory.quantity_reserved + quantity;
    const newQuantityAvailable = currentInventory.quantity_available - quantity;

    return this.updateInventory(materialId, {
      quantity_reserved: newQuantityReserved,
      quantity_available: newQuantityAvailable
    });
  }

  async unreserveStock(materialId: number, quantity: number): Promise<RawMaterialInventory> {
    const currentInventory = await this.getInventoryByMaterial(materialId);
    
    if (!currentInventory) {
      throw new Error('Inventory record not found');
    }

    const newQuantityReserved = Math.max(0, currentInventory.quantity_reserved - quantity);
    const newQuantityAvailable = currentInventory.quantity_on_hand - newQuantityReserved;

    return this.updateInventory(materialId, {
      quantity_reserved: newQuantityReserved,
      quantity_available: newQuantityAvailable
    });
  }

  async getLowStockMaterials(): Promise<RawMaterialWithInventory[]> {
    const { data, error } = await supabase
      .from('raw_materials')
      .select(`
        *,
        inventory:raw_material_inventory(*)
      `)
      .eq('active', true)
      .order('name');

    if (error) {
      console.error('Error fetching materials for low stock check:', error);
      throw error;
    }
    
    const materialsWithInventory = (data || []).map(material => ({
      ...material,
      inventory: Array.isArray(material.inventory) ? material.inventory[0] : material.inventory
    }));

    // Filter materials where available quantity is below reorder level
    return materialsWithInventory.filter(material => 
      material.inventory && 
      material.inventory.quantity_available <= material.reorder_level
    );
  }

  async checkStockAvailability(materialId: number, requiredQuantity: number): Promise<{
    available: boolean;
    currentStock: number;
    shortfall: number;
  }> {
    const inventory = await this.getInventoryByMaterial(materialId);
    
    if (!inventory) {
      return {
        available: false,
        currentStock: 0,
        shortfall: requiredQuantity
      };
    }

    const available = inventory.quantity_available >= requiredQuantity;
    const shortfall = available ? 0 : requiredQuantity - inventory.quantity_available;

    return {
      available,
      currentStock: inventory.quantity_available,
      shortfall
    };
  }

  // Category management methods
  async getCategories(activeOnly: boolean = true): Promise<MaterialCategory[]> {
    let query = supabase
      .from('material_categories')
      .select('*')
      .order('name');

    if (activeOnly) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
    
    return data || [];
  }

  async createCategory(category: MaterialCategoryInsert): Promise<MaterialCategory> {
    const { data, error } = await supabase
      .from('material_categories')
      .insert([category])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating category:', error);
      throw error;
    }
    
    return data;
  }

  async updateCategory(id: number, updates: MaterialCategoryUpdate): Promise<MaterialCategory> {
    const { data, error } = await supabase
      .from('material_categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating category:', error);
      throw error;
    }
    
    return data;
  }

  async deleteCategory(id: number): Promise<void> {
    // Check if category is being used by any raw materials
    const { data: materialsUsingCategory } = await supabase
      .from('raw_materials')
      .select('id')
      .eq('category_id', id)
      .limit(1);
    
    if (materialsUsingCategory && materialsUsingCategory.length > 0) {
      throw new Error('Cannot delete category: it is being used by existing raw materials');
    }

    const { error } = await supabase
      .from('material_categories')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }

  // Supplier management methods
  async getSuppliers(activeOnly: boolean = true): Promise<MaterialSupplier[]> {
    let query = supabase
      .from('material_suppliers')
      .select('*')
      .order('name');

    if (activeOnly) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching suppliers:', error);
      throw error;
    }
    
    return data || [];
  }

  async createSupplier(supplier: MaterialSupplierInsert): Promise<MaterialSupplier> {
    const { data, error } = await supabase
      .from('material_suppliers')
      .insert([supplier])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating supplier:', error);
      throw error;
    }
    
    return data;
  }

  async updateSupplier(id: number, updates: MaterialSupplierUpdate): Promise<MaterialSupplier> {
    const { data, error } = await supabase
      .from('material_suppliers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating supplier:', error);
      throw error;
    }
    
    return data;
  }

  async deleteSupplier(id: number): Promise<void> {
    // Check if supplier is being used by any raw materials
    const { data: materialsUsingSupplier } = await supabase
      .from('raw_materials')
      .select('id')
      .eq('supplier_id', id)
      .limit(1);
    
    if (materialsUsingSupplier && materialsUsingSupplier.length > 0) {
      throw new Error('Cannot delete supplier: it is being used by existing raw materials');
    }

    const { error } = await supabase
      .from('material_suppliers')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting supplier:', error);
      throw error;
    }
  }
}
