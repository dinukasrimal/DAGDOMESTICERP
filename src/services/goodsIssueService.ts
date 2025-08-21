import { supabase } from '@/integrations/supabase/client';

export interface GoodsIssue {
  id: string;
  issue_number: string;
  issue_date: string;
  issued_by?: string;
  issue_type: 'production' | 'maintenance' | 'sample' | 'waste' | 'adjustment';
  reference_number?: string;
  status: 'pending' | 'issued' | 'cancelled';
  notes?: string;
  created_at: string;
  updated_at: string;
  issued_by_user?: {
    id: string;
    email: string;
  };
  lines?: GoodsIssueLine[];
}

export interface GoodsIssueLine {
  id: string;
  goods_issue_id: string;
  raw_material_id: string;
  quantity_issued: number;
  unit_cost?: number;
  batch_number?: string;
  notes?: string;
  created_at: string;
  raw_material?: {
    id: string;
    name: string;
    code?: string;
    base_unit: string;
    current_quantity?: number;
  };
}

export interface CreateGoodsIssue {
  issue_date: string;
  issue_type: GoodsIssue['issue_type'];
  reference_number?: string;
  notes?: string;
  lines: CreateGoodsIssueLine[];
}

export interface CreateGoodsIssueLine {
  raw_material_id: string;
  quantity_issued: number;
  unit_cost?: number;
  batch_number?: string;
  notes?: string;
}

export interface BOMBasedGoodsIssue {
  issue_date: string;
  issue_type: GoodsIssue['issue_type'];
  reference_number?: string;
  notes?: string;
  bom_id: string;
  quantity_to_produce: number;
  category_product_selections?: {
    category_id: number;
    selected_products: {
      product_id: number;
      quantity: number;
    }[];
  }[];
}

export interface UpdateGoodsIssue {
  issue_date?: string;
  issue_type?: GoodsIssue['issue_type'];
  reference_number?: string;
  status?: GoodsIssue['status'];
  notes?: string;
}

export class GoodsIssueService {
  async getAllGoodsIssue(): Promise<GoodsIssue[]> {
    const { data, error } = await supabase
      .from('goods_issue')
      .select(`
        *,
        issued_by_user:auth.users(id, email),
        lines:goods_issue_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch goods issues: ${error.message}`);
    }

    return data || [];
  }

  async getGoodsIssue(id: string): Promise<GoodsIssue> {
    const { data, error } = await supabase
      .from('goods_issue')
      .select(`
        *,
        issued_by_user:auth.users(id, email),
        lines:goods_issue_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch goods issue: ${error.message}`);
    }

    return data;
  }

  async createGoodsIssue(goodsIssue: CreateGoodsIssue): Promise<GoodsIssue> {
    // Generate issue number
    const { data: issueNumberData, error: issueNumberError } = await supabase
      .rpc('generate_issue_number');

    if (issueNumberError) {
      throw new Error(`Failed to generate issue number: ${issueNumberError.message}`);
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    // Validate inventory availability
    for (const line of goodsIssue.lines) {
      await this.validateInventoryAvailability(line.raw_material_id, line.quantity_issued);
    }

    // Create goods issue record
    const { data: issueData, error: issueError } = await supabase
      .from('goods_issue')
      .insert({
        issue_number: issueNumberData,
        issue_date: goodsIssue.issue_date,
        issued_by: user?.id,
        issue_type: goodsIssue.issue_type,
        reference_number: goodsIssue.reference_number,
        notes: goodsIssue.notes,
      })
      .select()
      .single();

    if (issueError) {
      throw new Error(`Failed to create goods issue: ${issueError.message}`);
    }

    // Create goods issue lines with unit costs
    const linesData = await Promise.all(
      goodsIssue.lines.map(async (line) => {
        const unitCost = line.unit_cost || await this.getAverageCost(line.raw_material_id);
        return {
          goods_issue_id: issueData.id,
          raw_material_id: line.raw_material_id,
          quantity_issued: line.quantity_issued,
          unit_cost: unitCost,
          batch_number: line.batch_number,
          notes: line.notes,
        };
      })
    );

    const { error: linesError } = await supabase
      .from('goods_issue_lines')
      .insert(linesData);

    if (linesError) {
      throw new Error(`Failed to create goods issue lines: ${linesError.message}`);
    }

    return this.getGoodsIssue(issueData.id);
  }

  async updateGoodsIssue(id: string, updates: UpdateGoodsIssue): Promise<GoodsIssue> {
    const { error } = await supabase
      .from('goods_issue')
      .update(updates)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update goods issue: ${error.message}`);
    }

    return this.getGoodsIssue(id);
  }

  async deleteGoodsIssue(id: string): Promise<void> {
    // Check if already issued
    const { data: issueData, error: fetchError } = await supabase
      .from('goods_issue')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch goods issue: ${fetchError.message}`);
    }

    if (issueData.status === 'issued') {
      throw new Error('Cannot delete an issued goods issue. Cancel it first.');
    }

    const { error } = await supabase
      .from('goods_issue')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete goods issue: ${error.message}`);
    }
  }

  async issueGoods(id: string): Promise<void> {
    // Get the goods issue with lines
    const { data: issueData, error: fetchError } = await supabase
      .from('goods_issue')
      .select(`
        *,
        lines:goods_issue_lines(*)
      `)
      .eq('id', id)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch goods issue: ${fetchError.message}`);
    }

    if (issueData.status !== 'pending') {
      throw new Error('Only pending goods issues can be processed.');
    }

    // Validate inventory availability again
    for (const line of issueData.lines || []) {
      await this.validateInventoryAvailability(line.raw_material_id, line.quantity_issued);
    }

    // Update inventory for each line
    for (const line of issueData.lines || []) {
      await this.updateRawMaterialInventory(
        line.raw_material_id,
        -line.quantity_issued,
        line.unit_cost || 0
      );
    }

    // Update status to issued
    const { error } = await supabase
      .from('goods_issue')
      .update({ status: 'issued' })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update goods issue status: ${error.message}`);
    }
  }

  async cancelGoodsIssue(id: string): Promise<void> {
    const { data: issueData, error: fetchError } = await supabase
      .from('goods_issue')
      .select(`
        status,
        lines:goods_issue_lines(*)
      `)
      .eq('id', id)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch goods issue: ${fetchError.message}`);
    }

    if (issueData.status === 'issued') {
      // Reverse the inventory changes
      for (const line of issueData.lines || []) {
        await this.updateRawMaterialInventory(
          line.raw_material_id,
          line.quantity_issued,
          line.unit_cost || 0
        );
      }
    }

    // Update status to cancelled
    const { error } = await supabase
      .from('goods_issue')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to cancel goods issue: ${error.message}`);
    }
  }

  private async validateInventoryAvailability(materialId: string, requiredQuantity: number): Promise<void> {
    const { data: inventoryData, error } = await supabase
      .from('raw_material_inventory')
      .select('quantity')
      .eq('raw_material_id', materialId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to check inventory: ${error.message}`);
    }

    const availableQuantity = inventoryData?.quantity || 0;
    if (availableQuantity < requiredQuantity) {
      // Get material name for better error message
      const { data: materialData } = await supabase
        .from('raw_materials')
        .select('name')
        .eq('id', materialId)
        .single();

      const materialName = materialData?.name || 'Unknown Material';
      throw new Error(
        `Insufficient inventory for ${materialName}. Available: ${availableQuantity}, Required: ${requiredQuantity}`
      );
    }
  }

  private async getAverageCost(materialId: string): Promise<number> {
    const { data: inventoryData, error } = await supabase
      .from('raw_material_inventory')
      .select('average_cost')
      .eq('raw_material_id', materialId)
      .single();

    if (error) {
      return 0;
    }

    return inventoryData.average_cost || 0;
  }

  private async updateRawMaterialInventory(
    materialId: string, 
    quantityChange: number, 
    unitCost: number
  ): Promise<void> {
    // Get current inventory
    const { data: inventoryData, error: fetchError } = await supabase
      .from('raw_material_inventory')
      .select('quantity, total_cost, average_cost')
      .eq('raw_material_id', materialId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw new Error(`Failed to fetch inventory: ${fetchError.message}`);
    }

    const currentQuantity = inventoryData?.quantity || 0;
    const currentTotalCost = inventoryData?.total_cost || 0;
    const newQuantity = currentQuantity + quantityChange;

    let newTotalCost: number;
    let newAverageCost: number;

    if (quantityChange < 0) {
      // Issue (decrease): use average cost
      const avgCost = inventoryData?.average_cost || 0;
      newTotalCost = currentTotalCost + (quantityChange * avgCost);
    } else {
      // Receipt (increase): add at unit cost
      newTotalCost = currentTotalCost + (quantityChange * unitCost);
    }

    newAverageCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;

    // Update inventory
    const { error } = await supabase
      .from('raw_material_inventory')
      .upsert({
        raw_material_id: materialId,
        quantity: newQuantity,
        total_cost: newTotalCost,
        average_cost: newAverageCost,
        last_updated: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to update inventory: ${error.message}`);
    }
  }

  async getPendingGoodsIssue(): Promise<GoodsIssue[]> {
    const { data, error } = await supabase
      .from('goods_issue')
      .select(`
        *,
        issued_by_user:auth.users(id, email),
        lines:goods_issue_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit)
        )
      `)
      .eq('status', 'pending')
      .order('issue_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch pending goods issues: ${error.message}`);
    }

    return data || [];
  }

  async getGoodsIssueByType(issueType: GoodsIssue['issue_type']): Promise<GoodsIssue[]> {
    const { data, error } = await supabase
      .from('goods_issue')
      .select(`
        *,
        issued_by_user:auth.users(id, email),
        lines:goods_issue_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit)
        )
      `)
      .eq('issue_type', issueType)
      .order('issue_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch goods issues by type: ${error.message}`);
    }

    return data || [];
  }

  async addGoodsIssueLine(issueId: string, line: CreateGoodsIssueLine): Promise<void> {
    // Check if goods issue is still pending
    const { data: issueData, error: fetchError } = await supabase
      .from('goods_issue')
      .select('status')
      .eq('id', issueId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch goods issue: ${fetchError.message}`);
    }

    if (issueData.status !== 'pending') {
      throw new Error('Cannot modify a non-pending goods issue.');
    }

    const unitCost = line.unit_cost || await this.getAverageCost(line.raw_material_id);

    const { error } = await supabase
      .from('goods_issue_lines')
      .insert({
        goods_issue_id: issueId,
        raw_material_id: line.raw_material_id,
        quantity_issued: line.quantity_issued,
        unit_cost: unitCost,
        batch_number: line.batch_number,
        notes: line.notes,
      });

    if (error) {
      throw new Error(`Failed to add goods issue line: ${error.message}`);
    }
  }

  async updateGoodsIssueLine(lineId: string, updates: Partial<CreateGoodsIssueLine>): Promise<void> {
    const { error } = await supabase
      .from('goods_issue_lines')
      .update(updates)
      .eq('id', lineId);

    if (error) {
      throw new Error(`Failed to update goods issue line: ${error.message}`);
    }
  }

  async deleteGoodsIssueLine(lineId: string): Promise<void> {
    const { error } = await supabase
      .from('goods_issue_lines')
      .delete()
      .eq('id', lineId);

    if (error) {
      throw new Error(`Failed to delete goods issue line: ${error.message}`);
    }
  }

  async createBOMBasedGoodsIssue(bomIssue: BOMBasedGoodsIssue): Promise<GoodsIssue> {
    // First, get the BOM information
    const { data: bomData, error: bomError } = await supabase
      .from('bom_headers')
      .select(`
        *,
        lines:bom_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit, conversion_factor, cost_per_unit)
        )
      `)
      .eq('id', bomIssue.bom_id)
      .single();

    if (bomError) {
      throw new Error(`Failed to fetch BOM: ${bomError.message}`);
    }

    // Calculate material requirements based on BOM and production quantity
    const materialRequirements: CreateGoodsIssueLine[] = [];
    
    for (const line of bomData.lines || []) {
      if (!line.raw_material) continue;

      let totalQuantityNeeded = 0;

      if (bomData.is_category_wise && bomIssue.category_product_selections) {
        // For category-wise BOMs, calculate based on specific product selections
        for (const categorySelection of bomIssue.category_product_selections) {
          const totalCategoryQuantity = categorySelection.selected_products.reduce(
            (sum, p) => sum + p.quantity, 0
          );
          
          // Parse consumption from notes (simplified approach)
          // In a more robust implementation, you'd store consumption data separately
          const consumptionPerUnit = line.quantity * (1 + line.waste_percentage / 100);
          totalQuantityNeeded += consumptionPerUnit * totalCategoryQuantity;
        }
      } else {
        // For regular BOMs, use standard calculation
        const consumptionPerUnit = line.quantity * (1 + line.waste_percentage / 100);
        totalQuantityNeeded = consumptionPerUnit * bomIssue.quantity_to_produce / bomData.quantity;
      }

      if (totalQuantityNeeded > 0) {
        materialRequirements.push({
          raw_material_id: line.raw_material_id,
          quantity_issued: totalQuantityNeeded,
          notes: bomData.is_category_wise 
            ? `BOM-based issue for category-wise production` 
            : `BOM-based issue for ${bomIssue.quantity_to_produce} units`
        });
      }
    }

    // Create the goods issue with calculated material requirements
    const goodsIssueData: CreateGoodsIssue = {
      issue_date: bomIssue.issue_date,
      issue_type: bomIssue.issue_type,
      reference_number: bomIssue.reference_number || `BOM-${bomData.name}`,
      notes: `${bomIssue.notes || ''}\nBOM-based issue for ${bomIssue.quantity_to_produce} units using BOM: ${bomData.name}`,
      lines: materialRequirements
    };

    return this.createGoodsIssue(goodsIssueData);
  }

  async getBOMConsumptionPreview(bomId: string, quantityToProduce: number, categorySelections?: BOMBasedGoodsIssue['category_product_selections']): Promise<{
    material_id: string;
    material_name: string;
    required_quantity: number;
    available_quantity: number;
    unit: string;
    is_sufficient: boolean;
  }[]> {
    // Get BOM data
    const { data: bomData, error: bomError } = await supabase
      .from('bom_headers')
      .select(`
        *,
        lines:bom_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit, conversion_factor, cost_per_unit)
        )
      `)
      .eq('id', bomId)
      .single();

    if (bomError) {
      throw new Error(`Failed to fetch BOM: ${bomError.message}`);
    }

    // Get current inventory levels
    const { data: inventoryData, error: inventoryError } = await supabase
      .from('raw_material_inventory')
      .select('raw_material_id, quantity');

    if (inventoryError) {
      throw new Error(`Failed to fetch inventory: ${inventoryError.message}`);
    }

    const inventoryMap = new Map(inventoryData?.map(inv => [inv.raw_material_id, inv.quantity]) || []);

    // Calculate requirements
    const requirements = [];
    
    for (const line of bomData.lines || []) {
      if (!line.raw_material) continue;

      let totalQuantityNeeded = 0;

      if (bomData.is_category_wise && categorySelections) {
        // Calculate based on category selections
        for (const categorySelection of categorySelections) {
          const totalCategoryQuantity = categorySelection.selected_products.reduce(
            (sum, p) => sum + p.quantity, 0
          );
          
          const consumptionPerUnit = line.quantity * (1 + line.waste_percentage / 100);
          totalQuantityNeeded += consumptionPerUnit * totalCategoryQuantity;
        }
      } else {
        // Standard calculation
        const consumptionPerUnit = line.quantity * (1 + line.waste_percentage / 100);
        totalQuantityNeeded = consumptionPerUnit * quantityToProduce / bomData.quantity;
      }

      const availableQuantity = inventoryMap.get(line.raw_material_id) || 0;

      requirements.push({
        material_id: line.raw_material_id,
        material_name: line.raw_material.name,
        required_quantity: totalQuantityNeeded,
        available_quantity: availableQuantity,
        unit: line.raw_material.base_unit,
        is_sufficient: availableQuantity >= totalQuantityNeeded
      });
    }

    return requirements;
  }
}