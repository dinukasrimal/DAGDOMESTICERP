import { supabase } from '@/integrations/supabase/client';

export interface GoodsReceived {
  id: string;
  grn_number: string;
  purchase_order_id: string;
  received_date: string;
  received_by?: string;
  status: 'pending' | 'verified' | 'posted';
  notes?: string;
  created_at: string;
  updated_at: string;
  purchase_order?: {
    id: string;
    po_number: string;
    supplier?: {
      id: string;
      name: string;
    };
  };
  lines?: GoodsReceivedLine[];
  received_by_user?: {
    id: string;
    email: string;
  };
}

export interface GoodsReceivedLine {
  id: string;
  goods_received_id: string;
  purchase_order_line_id: string;
  raw_material_id: string;
  quantity_received: number;
  unit_price: number;
  batch_number?: string;
  expiry_date?: string;
  notes?: string;
  created_at: string;
  raw_material?: {
    id: string;
    name: string;
    code?: string;
    base_unit: string;
    purchase_unit: string;
  };
  purchase_order_line?: {
    id: string;
    quantity: number;
    received_quantity: number;
  };
}

export interface CreateGoodsReceived {
  purchase_order_id: string;
  received_date: string;
  notes?: string;
  lines: CreateGoodsReceivedLine[];
}

export interface CreateGoodsReceivedLine {
  purchase_order_line_id: string;
  raw_material_id: string;
  quantity_received: number;
  unit_price: number;
  batch_number?: string;
  expiry_date?: string;
  notes?: string;
}

export interface UpdateGoodsReceived {
  received_date?: string;
  status?: GoodsReceived['status'];
  notes?: string;
}

export class GoodsReceivedService {
  async getAllGoodsReceived(): Promise<GoodsReceived[]> {
    const { data, error } = await supabase
      .from('goods_received')
      .select(`
        *,
        purchase_order:purchase_orders(
          id, po_number,
          supplier:suppliers(id, name)
        ),
        received_by_user:auth.users(id, email),
        lines:goods_received_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit),
          purchase_order_line:purchase_order_lines(id, quantity, received_quantity)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch goods received: ${error.message}`);
    }

    return data || [];
  }

  async getGoodsReceived(id: string): Promise<GoodsReceived> {
    const { data, error } = await supabase
      .from('goods_received')
      .select(`
        *,
        purchase_order:purchase_orders(
          id, po_number,
          supplier:suppliers(id, name)
        ),
        received_by_user:auth.users(id, email),
        lines:goods_received_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit),
          purchase_order_line:purchase_order_lines(id, quantity, received_quantity)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch goods received: ${error.message}`);
    }

    return data;
  }

  async createGoodsReceived(goodsReceived: CreateGoodsReceived): Promise<GoodsReceived> {
    // Generate GRN number
    const { data: grnNumberData, error: grnNumberError } = await supabase
      .rpc('generate_grn_number');

    if (grnNumberError) {
      throw new Error(`Failed to generate GRN number: ${grnNumberError.message}`);
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    // Create goods received record
    const { data: grnData, error: grnError } = await supabase
      .from('goods_received')
      .insert({
        grn_number: grnNumberData,
        purchase_order_id: goodsReceived.purchase_order_id,
        received_date: goodsReceived.received_date,
        received_by: user?.id,
        notes: goodsReceived.notes,
      })
      .select()
      .single();

    if (grnError) {
      throw new Error(`Failed to create goods received: ${grnError.message}`);
    }

    // Create goods received lines
    const linesData = goodsReceived.lines.map(line => ({
      goods_received_id: grnData.id,
      purchase_order_line_id: line.purchase_order_line_id,
      raw_material_id: line.raw_material_id,
      quantity_received: line.quantity_received,
      unit_price: line.unit_price,
      batch_number: line.batch_number,
      expiry_date: line.expiry_date,
      notes: line.notes,
    }));

    const { error: linesError } = await supabase
      .from('goods_received_lines')
      .insert(linesData);

    if (linesError) {
      throw new Error(`Failed to create goods received lines: ${linesError.message}`);
    }

    // Update purchase order lines received quantities
    for (const line of goodsReceived.lines) {
      await this.updatePurchaseOrderLineReceived(line.purchase_order_line_id, line.quantity_received);
    }

    return this.getGoodsReceived(grnData.id);
  }

  async updateGoodsReceived(id: string, updates: UpdateGoodsReceived): Promise<GoodsReceived> {
    const { error } = await supabase
      .from('goods_received')
      .update(updates)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update goods received: ${error.message}`);
    }

    return this.getGoodsReceived(id);
  }

  async deleteGoodsReceived(id: string): Promise<void> {
    // Get the GRN lines to reverse the received quantities
    const { data: grnData, error: fetchError } = await supabase
      .from('goods_received')
      .select(`
        lines:goods_received_lines(
          purchase_order_line_id,
          quantity_received
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch goods received for deletion: ${fetchError.message}`);
    }

    // Reverse the received quantities on purchase order lines
    for (const line of grnData.lines || []) {
      await this.updatePurchaseOrderLineReceived(line.purchase_order_line_id, -line.quantity_received);
    }

    const { error } = await supabase
      .from('goods_received')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete goods received: ${error.message}`);
    }
  }

  async postGoodsReceived(id: string): Promise<void> {
    // Start transaction by updating status to posted
    const { data: grnData, error: updateError } = await supabase
      .from('goods_received')
      .update({ status: 'posted' })
      .eq('id', id)
      .select(`
        lines:goods_received_lines(
          raw_material_id,
          quantity_received,
          unit_price,
          batch_number,
          expiry_date
        )
      `)
      .single();

    if (updateError) {
      throw new Error(`Failed to post goods received: ${updateError.message}`);
    }

    // Update raw materials inventory
    for (const line of grnData.lines || []) {
      await this.updateRawMaterialInventory(
        line.raw_material_id,
        line.quantity_received,
        line.unit_price
      );
    }
  }

  private async updatePurchaseOrderLineReceived(poLineId: string, quantityChange: number): Promise<void> {
    // Get current received quantity
    const { data: lineData, error: fetchError } = await supabase
      .from('purchase_order_lines')
      .select('received_quantity, quantity')
      .eq('id', poLineId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch purchase order line: ${fetchError.message}`);
    }

    const newReceivedQuantity = lineData.received_quantity + quantityChange;

    // Update received quantity
    const { error } = await supabase
      .from('purchase_order_lines')
      .update({ received_quantity: newReceivedQuantity })
      .eq('id', poLineId);

    if (error) {
      throw new Error(`Failed to update purchase order line received quantity: ${error.message}`);
    }

    // Update purchase order status based on received quantities
    await this.updatePurchaseOrderStatus(poLineId);
  }

  private async updatePurchaseOrderStatus(poLineId: string): Promise<void> {
    // Get purchase order ID and check all lines
    const { data: poData, error: fetchError } = await supabase
      .from('purchase_order_lines')
      .select(`
        purchase_order_id,
        purchase_order:purchase_orders!inner(
          id,
          lines:purchase_order_lines(quantity, received_quantity)
        )
      `)
      .eq('id', poLineId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch purchase order for status update: ${fetchError.message}`);
    }

    const allLines = poData.purchase_order.lines;
    const fullyReceived = allLines.every(line => line.received_quantity >= line.quantity);
    const partiallyReceived = allLines.some(line => line.received_quantity > 0);

    let newStatus: 'sent' | 'partial_received' | 'received' = 'sent';
    if (fullyReceived) {
      newStatus = 'received';
    } else if (partiallyReceived) {
      newStatus = 'partial_received';
    }

    const { error } = await supabase
      .from('purchase_orders')
      .update({ status: newStatus })
      .eq('id', poData.purchase_order_id);

    if (error) {
      throw new Error(`Failed to update purchase order status: ${error.message}`);
    }
  }

  private async updateRawMaterialInventory(materialId: string, quantity: number, unitCost: number): Promise<void> {
    // Get current inventory
    const { data: inventoryData, error: fetchError } = await supabase
      .from('raw_material_inventory')
      .select('quantity, total_cost')
      .eq('raw_material_id', materialId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new Error(`Failed to fetch inventory: ${fetchError.message}`);
    }

    const currentQuantity = inventoryData?.quantity || 0;
    const currentTotalCost = inventoryData?.total_cost || 0;
    const newQuantity = currentQuantity + quantity;
    const newTotalCost = currentTotalCost + (quantity * unitCost);
    const newAverageCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;

    // Upsert inventory record
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

  async getPendingGoodsReceived(): Promise<GoodsReceived[]> {
    const { data, error } = await supabase
      .from('goods_received')
      .select(`
        *,
        purchase_order:purchase_orders(
          id, po_number,
          supplier:suppliers(id, name)
        ),
        received_by_user:auth.users(id, email),
        lines:goods_received_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit),
          purchase_order_line:purchase_order_lines(id, quantity, received_quantity)
        )
      `)
      .in('status', ['pending', 'verified'])
      .order('received_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch pending goods received: ${error.message}`);
    }

    return data || [];
  }
}