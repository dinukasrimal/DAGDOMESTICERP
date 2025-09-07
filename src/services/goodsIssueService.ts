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
  private async consumeInventoryLayers(materialId: number, requiredQty: number): Promise<number> {
    // FIFO over raw_material_inventory rows (layer-wise entries), not averages
    let remaining = requiredQty;
    let costAccum = 0;
    let qtyAccum = 0;

    const { data: rows, error } = await supabase
      .from('raw_material_inventory')
      .select('*')
      .eq('raw_material_id', materialId);
    if (error) throw new Error(`Failed to load inventory for FIFO: ${error.message}`);

    const layers = (rows || [])
      .map((r: any) => {
        const qty = Number(r.quantity_available ?? r.quantity_on_hand ?? 0);
        const cost = Number(r.unit_price ?? r.unit_cost ?? 0);
        const ts = r.last_updated || r.created_at || r.updated_at || '1970-01-01T00:00:00Z';
        return { id: r.id as string, qty, cost, ts };
      })
      .filter(l => l.qty > 0)
      .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));

    const updates: { id: string; newQty: number; take: number }[] = [];

    for (const layer of layers) {
      if (remaining <= 0) break;
      const take = Math.min(layer.qty, remaining);
      if (take > 0) {
        remaining -= take;
        qtyAccum += take;
        costAccum += take * layer.cost;
        updates.push({ id: layer.id, newQty: layer.qty - take, take });
      }
    }

    if (remaining > 0) {
      throw new Error('Insufficient inventory layers for FIFO consumption');
    }

    // Persist updates back to raw_material_inventory
    for (const u of updates) {
      const { data: row } = await supabase
        .from('raw_material_inventory')
        .select('*')
        .eq('id', u.id)
        .maybeSingle();
      const hasQtyAvailable = row && Object.prototype.hasOwnProperty.call(row, 'quantity_available');
      const hasQtyOnHand = row && Object.prototype.hasOwnProperty.call(row, 'quantity_on_hand');
      const payload: any = { last_updated: new Date().toISOString() };
      if (hasQtyAvailable) payload.quantity_available = Math.max(0, Number(row.quantity_available || 0) - u.take);
      if (hasQtyOnHand) payload.quantity_on_hand = Math.max(0, Number(row.quantity_on_hand || 0) - u.take);
      const { error: updErr } = await supabase
        .from('raw_material_inventory')
        .update(payload)
        .eq('id', u.id);
      if (updErr) throw new Error(`Failed to update inventory layer: ${updErr.message}`);
    }

    return qtyAccum > 0 ? costAccum / qtyAccum : 0;
  }
  private async attachLinesAndMaterials(issues: GoodsIssue[]): Promise<GoodsIssue[]> {
    if (!issues.length) return issues;

    const issueIds = issues.map(i => i.id);
    const { data: lines, error: linesErr } = await supabase
      .from('goods_issue_lines')
      .select('*')
      .in('goods_issue_id', issueIds);
    if (linesErr) throw new Error(`Failed to fetch goods issue lines: ${linesErr.message}`);

    const materialIds = Array.from(new Set((lines || []).map(l => l.raw_material_id).filter(Boolean)));
    let materialsMap = new Map<string, any>();
    if (materialIds.length) {
      const { data: materials, error: matErr } = await supabase
        .from('raw_materials')
        .select('id, name, code, base_unit')
        .in('id', materialIds);
      if (matErr) throw new Error(`Failed to fetch raw materials: ${matErr.message}`);
      materialsMap = new Map((materials || []).map(m => [m.id, m]));
    }

    const linesByIssue = new Map<string, GoodsIssueLine[]>();
    for (const l of lines || []) {
      const arr = linesByIssue.get(l.goods_issue_id) || [];
      const rawMat = materialsMap.get(l.raw_material_id);
      arr.push({
        ...l,
        raw_material: rawMat ? {
          id: rawMat.id,
          name: rawMat.name,
          code: rawMat.code,
          base_unit: rawMat.base_unit,
        } : undefined,
      } as GoodsIssueLine);
      linesByIssue.set(l.goods_issue_id, arr);
    }

    return issues.map(i => ({ ...i, lines: linesByIssue.get(i.id) || [] }));
  }

  async getAllGoodsIssue(): Promise<GoodsIssue[]> {
    try {
      const { data, error } = await supabase
        .from('goods_issue')
        .select('*')
        .order('issue_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return this.attachLinesAndMaterials((data || []) as unknown as GoodsIssue[]);
    } catch (err: any) {
      if (typeof err?.message === 'string' && err.message.toLowerCase().includes('relation')) {
        console.warn('Goods Issue tables not found. Returning empty list. Apply migrations in supabase/migrations/20250821000002-create-purchase-goods-management.sql');
        return [];
      }
      throw new Error(`Failed to fetch goods issues: ${err?.message || err}`);
    }
  }

  async getGoodsIssue(id: string): Promise<GoodsIssue> {
    try {
      const { data, error } = await supabase
        .from('goods_issue')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      const issues = await this.attachLinesAndMaterials([data as unknown as GoodsIssue]);
      return issues[0];
    } catch (err: any) {
      if (typeof err?.message === 'string' && err.message.toLowerCase().includes('relation')) {
        throw new Error('Goods Issue tables not found. Please apply migrations (supabase/migrations/20250821000002-create-purchase-goods-management.sql).');
      }
      throw new Error(`Failed to fetch goods issue: ${err?.message || err}`);
    }
  }

  async createGoodsIssue(goodsIssue: CreateGoodsIssue): Promise<GoodsIssue> {
    // Generate next issue number via RPC
    let generatedNumber: string | null = null;
    try {
      const { data: nextNumber, error: numErr } = await supabase.rpc('generate_issue_number');
      if (numErr) throw numErr;
      generatedNumber = nextNumber as unknown as string;
    } catch {
      // Fallback to timestamp-based number if RPC is unavailable
      const ts = Date.now().toString().slice(-8);
      generatedNumber = `GI${ts}`;
    }

    // Insert goods_issue header
    let header: any;
    try {
      const res = await supabase
        .from('goods_issue')
        .insert({
          issue_number: generatedNumber as string,
          issue_date: goodsIssue.issue_date,
          issue_type: goodsIssue.issue_type,
          reference_number: goodsIssue.reference_number,
          status: 'pending',
          notes: goodsIssue.notes,
        })
        .select()
        .single();
      if (res.error) throw res.error;
      header = res.data;
    } catch (err: any) {
      if (typeof err?.message === 'string' && err.message.toLowerCase().includes('relation')) {
        console.warn('Goods Issue tables not found. Creating non-persistent mock for UI continuity.');
        const mockIssue: GoodsIssue = {
          id: 'mock-' + Date.now(),
          issue_number: generatedNumber as string,
          issue_date: goodsIssue.issue_date,
          issue_type: goodsIssue.issue_type,
          reference_number: goodsIssue.reference_number,
          status: 'pending',
          notes: goodsIssue.notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          lines: goodsIssue.lines.map((line, index) => ({
            id: 'mock-line-' + index,
            goods_issue_id: 'mock-' + Date.now(),
            raw_material_id: line.raw_material_id,
            quantity_issued: line.quantity_issued,
            unit_cost: line.unit_cost,
            batch_number: line.batch_number,
            notes: line.notes,
            created_at: new Date().toISOString()
          }))
        };
        return mockIssue;
      }
      throw new Error(`Failed to create goods issue: ${err?.message || err}`);
    }

    // Insert lines (unit_cost may be null; will be finalized on issue)
    if (goodsIssue.lines && goodsIssue.lines.length > 0) {
      const { error: linesErr } = await supabase
        .from('goods_issue_lines')
        .insert(
          goodsIssue.lines.map((l) => ({
            goods_issue_id: header.id,
            raw_material_id: l.raw_material_id,
            quantity_issued: l.quantity_issued,
            unit_cost: l.unit_cost,
            batch_number: l.batch_number,
            notes: l.notes,
          }))
        );
      if (linesErr) {
        throw new Error(`Failed to create goods issue lines: ${linesErr.message}`);
      }
    }

    // Return the composed issue with lines + material info
    return this.getGoodsIssue(header.id);
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
    // Fetch issue with lines
    const issue = await this.getGoodsIssue(id);
    if (!issue) throw new Error('Goods issue not found');
    if (issue.status !== 'pending') throw new Error('Only pending issues can be issued');

    // For each line, ensure unit cost and update inventory (via layer consumption)
    for (const line of issue.lines || []) {
      // FIFO consumption for cost (if cost not provided)
      let unitCost = line.unit_cost;
      if (unitCost == null) {
        unitCost = await this.consumeInventoryLayers(Number(line.raw_material_id), Number(line.quantity_issued));
        const { error: updErr } = await supabase
          .from('goods_issue_lines')
          .update({ unit_cost: unitCost })
          .eq('id', line.id);
        if (updErr) {
          throw new Error(`Failed to set unit cost for line: ${updErr.message}`);
        }
      } else {
        // Consume layers even if cost provided to decrement quantities
        await this.consumeInventoryLayers(Number(line.raw_material_id), Number(line.quantity_issued));
      }

      // Validate availability after layer updates (aggregate across rows)
      await this.validateInventoryAvailability(line.raw_material_id, line.quantity_issued);
    }

    // Mark header as issued
    const { error } = await supabase
      .from('goods_issue')
      .update({ status: 'issued' })
      .eq('id', id);
    if (error) {
      throw new Error(`Failed to mark goods issue as issued: ${error.message}`);
    }
  }

  async cancelGoodsIssue(id: string): Promise<void> {
    const { error } = await supabase
      .from('goods_issue')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) {
      throw new Error(`Failed to cancel goods issue: ${error.message}`);
    }
  }

  private async validateInventoryAvailability(materialId: string, requiredQuantity: number): Promise<void> {
    const id = Number(materialId);
    const { data: rows, error } = await supabase
      .from('raw_material_inventory')
      .select('*')
      .eq('raw_material_id', id);

    if (error) {
      throw new Error(`Failed to check inventory: ${error.message}`);
    }

    // Sum across all rows for this material
    let availableQuantity = 0;
    for (const r of rows || []) {
      const qtyAvail = r.quantity_available ?? (Math.max(0, Number(r.quantity_on_hand || 0) - Number(r.quantity_reserved || 0)));
      availableQuantity += Number(qtyAvail || 0);
    }
    if (availableQuantity < requiredQuantity) {
      // Get material name for better error message
      const { data: materialData } = await supabase
        .from('raw_materials')
        .select('name')
        .eq('id', id)
        .single();

      const materialName = materialData?.name || 'Unknown Material';
      throw new Error(
        `Insufficient inventory for ${materialName}. Available: ${availableQuantity}, Required: ${requiredQuantity}`
      );
    }
  }

  private async getAverageCost(materialId: string): Promise<number> {
    // Do not use averages for costing; FIFO sets cost on issue
    return 0;
  }

  private async updateRawMaterialInventory(
    materialId: string,
    quantityChange: number,
    unitCost: number
  ): Promise<void> {
    const id = Number(materialId);
    // If multiple rows exist, assume layer-wise tracking and skip aggregate update.
    const { data: invRows, error: invErr } = await supabase
      .from('raw_material_inventory')
      .select('id')
      .eq('raw_material_id', id);
    if (invErr) throw new Error(`Failed to fetch inventory: ${invErr.message}`);
    if (Array.isArray(invRows) && invRows.length > 1) {
      return; // layers already updated during consumption
    }
    // Fallback: single-row schema update
    const { data: inventoryData, error: fetchError } = await supabase
      .from('raw_material_inventory')
      .select('quantity_on_hand, quantity_reserved, quantity_available, location')
      .eq('raw_material_id', id)
      .maybeSingle();
    if (fetchError && fetchError.code && fetchError.code !== 'PGRST116') {
      throw new Error(`Failed to fetch inventory: ${fetchError.message}`);
    }
    const currentOnHand = inventoryData?.quantity_on_hand || 0;
    const currentReserved = inventoryData?.quantity_reserved || 0;
    const newOnHand = currentOnHand + quantityChange;
    const newAvailable = Math.max(0, newOnHand - currentReserved);
    const payload: any = {
      quantity_on_hand: newOnHand,
      quantity_available: newAvailable,
      location: inventoryData?.location ?? 'Default Warehouse',
      last_updated: new Date().toISOString(),
    };
    let invWriteErr: any = null;
    if (inventoryData) {
      const { error } = await supabase
        .from('raw_material_inventory')
        .update(payload)
        .eq('raw_material_id', id);
      invWriteErr = error;
    } else {
      const { error } = await supabase
        .from('raw_material_inventory')
        .insert({ raw_material_id: id, ...payload });
      invWriteErr = error;
    }
    if (invWriteErr) throw new Error(`Failed to update inventory: ${invWriteErr.message}`);
  }

  async getPendingGoodsIssue(): Promise<GoodsIssue[]> {
    try {
      const { data, error } = await supabase
        .from('goods_issue')
        .select('*')
        .eq('status', 'pending')
        .order('issue_date', { ascending: true });
      if (error) throw error;
      return this.attachLinesAndMaterials((data || []) as unknown as GoodsIssue[]);
    } catch (err: any) {
      if (typeof err?.message === 'string' && err.message.toLowerCase().includes('relation')) {
        return [];
      }
      throw new Error(`Failed to fetch pending goods issues: ${err?.message || err}`);
    }
  }

  async getGoodsIssueByType(issueType: GoodsIssue['issue_type']): Promise<GoodsIssue[]> {
    try {
      const { data, error } = await supabase
        .from('goods_issue')
        .select('*')
        .eq('issue_type', issueType)
        .order('issue_date', { ascending: false });
      if (error) throw error;
      return this.attachLinesAndMaterials((data || []) as unknown as GoodsIssue[]);
    } catch (err: any) {
      if (typeof err?.message === 'string' && err.message.toLowerCase().includes('relation')) {
        return [];
      }
      throw new Error(`Failed to fetch goods issues by type: ${err?.message || err}`);
    }
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

    // Get current inventory levels (aggregate across rows per material)
    const { data: inventoryData, error: inventoryError } = await supabase
      .from('raw_material_inventory')
      .select('raw_material_id, quantity_available, quantity_on_hand, quantity');
    if (inventoryError) {
      throw new Error(`Failed to fetch inventory: ${inventoryError.message}`);
    }
    const inventoryMap = new Map<number, number>();
    for (const inv of inventoryData || []) {
      const id = Number((inv as any).raw_material_id);
      const qty = Number((inv as any).quantity_available ?? (inv as any).quantity_on_hand ?? (inv as any).quantity ?? 0);
      inventoryMap.set(id, (inventoryMap.get(id) || 0) + qty);
    }

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

      const availableQuantity = inventoryMap.get(Number(line.raw_material_id)) || 0;

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
