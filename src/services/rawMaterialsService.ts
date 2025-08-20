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
  
  async getRawMaterials(activeOnly: boolean = true): Promise<RawMaterialWithInventory[]> {
    let query = supabase
      .from('raw_materials')
      .select(`
        *,
        inventory:raw_material_inventory(*),
        category:material_categories(*),
        supplier:material_suppliers(*)
      `)
      .order('name');

    if (activeOnly) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching raw materials:', error);
      throw error;
    }
    
    return (data || []).map(material => ({
      ...material,
      inventory: Array.isArray(material.inventory) ? material.inventory[0] : material.inventory,
      category: Array.isArray(material.category) ? material.category[0] : material.category,
      supplier: Array.isArray(material.supplier) ? material.supplier[0] : material.supplier
    }));
  }

  async getRawMaterialById(id: number): Promise<RawMaterialWithInventory | null> {
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
    
    if (error) {
      console.error('Error fetching raw material:', error);
      throw error;
    }
    
    return data ? {
      ...data,
      inventory: Array.isArray(data.inventory) ? data.inventory[0] : data.inventory,
      category: Array.isArray(data.category) ? data.category[0] : data.category,
      supplier: Array.isArray(data.supplier) ? data.supplier[0] : data.supplier
    } : null;
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
      .eq('raw_material_id', materialId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error fetching inventory:', error);
      throw error;
    }
    
    return data;
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