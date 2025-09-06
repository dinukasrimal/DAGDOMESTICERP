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
  roll_barcode?: string;
  roll_weight?: number;
  roll_length?: number;
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
  roll_barcode?: string;
  roll_weight?: number;
  roll_length?: number;
}

export interface FabricRoll {
  barcode: string;
  weight: number;
  length?: number;
  batch_number?: string;
}

export interface UpdateGoodsReceived {
  received_date?: string;
  status?: GoodsReceived['status'];
  notes?: string;
}

export class GoodsReceivedService {
  private async addInventoryLayer(params: { raw_material_id: number, grn_line_id?: string, quantity: number, unit_cost: number, batch_number?: string | null, expiry_date?: string | null }): Promise<void> {
    try {
      const { error } = await supabase
        .from('inventory_layers')
        .insert({
          raw_material_id: params.raw_material_id,
          grn_line_id: params.grn_line_id || null,
          qty_remaining: params.quantity,
          unit_cost: params.unit_cost,
          batch_number: params.batch_number || null,
          expiry_date: params.expiry_date || null,
          received_at: new Date().toISOString(),
        });
      if (error) throw error;
    } catch (err: any) {
      // Fail soft if layers table is not present
      if (typeof err?.message === 'string' && err.message.toLowerCase().includes('relation')) {
        console.warn('inventory_layers table not found; skipping layer creation');
        return;
      }
      console.error('Failed to add inventory layer:', err);
      // Do not block GRN posting because of layers
    }
  }
  async getAllGoodsReceived(): Promise<GoodsReceived[]> {
    const { data, error } = await supabase
      .from('goods_received')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch goods received: ${error.message}`);
    }

    // Manually fetch related data for each goods received record
    const goodsReceivedWithDetails = await Promise.all(
      (data || []).map(async (gr) => {
        // Fetch purchase order with supplier
        const { data: poData } = await supabase
          .from('raw_material_purchase_orders')
          .select(`
            id, po_number,
            supplier:material_suppliers(id, name)
          `)
          .eq('id', gr.purchase_order_id)
          .single();

        // Fetch received by user
        const { data: userData } = await supabase
          .from('auth.users')
          .select('id, email')
          .eq('id', gr.received_by)
          .single();

        // Fetch goods received lines
        const { data: linesData } = await supabase
          .from('goods_received_lines')
          .select('*')
          .eq('goods_received_id', gr.id);

        // Fetch related data for each line
        const linesWithDetails = await Promise.all(
          (linesData || []).map(async (line) => {
            // Fetch raw material
            const { data: materialData } = await supabase
              .from('raw_materials')
              .select('id, name, code, base_unit, purchase_unit')
              .eq('id', line.raw_material_id)
              .single();

            // Fetch purchase order line
            const { data: poLineData } = await supabase
              .from('raw_material_purchase_order_lines')
              .select('id, quantity, received_quantity')
              .eq('id', line.purchase_order_line_id)
              .single();

            return {
              ...line,
              raw_material: materialData,
              purchase_order_line: poLineData
            };
          })
        );

        return {
          ...gr,
          purchase_order: {
            ...poData,
            supplier: Array.isArray(poData?.supplier) ? poData.supplier[0] : poData?.supplier
          },
          received_by_user: userData,
          lines: linesWithDetails
        };
      })
    );

    return goodsReceivedWithDetails;
  }

  async getGoodsReceived(id: string): Promise<GoodsReceived> {
    const { data, error } = await supabase
      .from('goods_received')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch goods received: ${error.message}`);
    }

    // Fetch purchase order with supplier
    const { data: poData } = await supabase
      .from('raw_material_purchase_orders')
      .select(`
        id, po_number,
        supplier:material_suppliers(id, name)
      `)
      .eq('id', data.purchase_order_id)
      .single();

    // Fetch received by user
    const { data: userData } = await supabase
      .from('auth.users')
      .select('id, email')
      .eq('id', data.received_by)
      .single();

    // Fetch goods received lines
    const { data: linesData } = await supabase
      .from('goods_received_lines')
      .select('*')
      .eq('goods_received_id', data.id);

    // Fetch related data for each line
    const linesWithDetails = await Promise.all(
      (linesData || []).map(async (line) => {
        // Fetch raw material
        const { data: materialData } = await supabase
          .from('raw_materials')
          .select('id, name, code, base_unit, purchase_unit')
          .eq('id', line.raw_material_id)
          .single();

        // Fetch purchase order line
        const { data: poLineData } = await supabase
          .from('raw_material_purchase_order_lines')
          .select('id, quantity, received_quantity')
          .eq('id', line.purchase_order_line_id)
          .single();

        return {
          ...line,
          raw_material: materialData,
          purchase_order_line: poLineData
        };
      })
    );

    return {
      ...data,
      purchase_order: {
        ...poData,
        supplier: Array.isArray(poData?.supplier) ? poData.supplier[0] : poData?.supplier
      },
      received_by_user: userData,
      lines: linesWithDetails
    };
  }

  async createGoodsReceived(goodsReceived: CreateGoodsReceived): Promise<GoodsReceived> {
    try {
      console.log('Creating goods received with data:', goodsReceived);

      // Generate GRN number using timestamp and date
      const currentDate = new Date();
      const yearMonth = currentDate.getFullYear().toString() + (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const timestamp = currentDate.getTime().toString().slice(-4);
      const grnNumber = `GRN-${yearMonth}-${timestamp}`;

      console.log('Generated GRN number:', grnNumber);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create goods received record
      const { data: grnData, error: grnError } = await supabase
        .from('goods_received')
        .insert({
          grn_number: grnNumber,
          purchase_order_id: goodsReceived.purchase_order_id,
          received_date: goodsReceived.received_date,
          received_by: user?.id,
          notes: goodsReceived.notes,
        })
        .select()
        .single();

      if (grnError) {
        console.error('Error creating goods received:', grnError);
        throw new Error(`Failed to create goods received: ${grnError.message}`);
      }

      console.log('Created goods received:', grnData);

      // Create goods received lines
      if (goodsReceived.lines.length > 0) {
        const linesData = goodsReceived.lines.map(line => ({
          goods_received_id: grnData.id,
          purchase_order_line_id: line.purchase_order_line_id,
          raw_material_id: line.raw_material_id,
          quantity_received: line.quantity_received,
          unit_price: line.unit_price,
          batch_number: line.batch_number || null,
          expiry_date: line.expiry_date || null,
          notes: line.notes,
          roll_barcode: line.roll_barcode || null,
          roll_weight: line.roll_weight || null,
          roll_length: line.roll_length || null,
        }));

        console.log('Creating goods received lines:', linesData);

        const { error: linesError } = await supabase
          .from('goods_received_lines')
          .insert(linesData);

        if (linesError) {
          console.error('Error creating goods received lines:', linesError);
          throw new Error(`Failed to create goods received lines: ${linesError.message}`);
        }

        // Update purchase order lines received quantities
        for (const line of goodsReceived.lines) {
          await this.updatePurchaseOrderLineReceived(line.purchase_order_line_id, line.quantity_received);
        }
      }

      return this.getGoodsReceived(grnData.id);
    } catch (error) {
      console.error('Goods received creation failed:', error);
      throw error;
    }
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

  async verifyGoodsReceived(id: string): Promise<void> {
    // Auto-post to inventory on verification (no separate post step)
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
      throw new Error(`Failed to verify/post goods received: ${updateError.message}`);
    }

    // Update raw materials inventory and layers
    for (const line of grnData.lines || []) {
      const materialId = Number(line.raw_material_id);
      await this.updateRawMaterialInventory(materialId, line.quantity_received, line.unit_price);
      await this.addInventoryLayer({
        raw_material_id: materialId,
        quantity: line.quantity_received,
        unit_cost: line.unit_price,
        batch_number: line.batch_number || null,
        expiry_date: line.expiry_date || null,
      });
    }
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
      .from('raw_material_purchase_order_lines')
      .select('received_quantity, quantity')
      .eq('id', poLineId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch purchase order line: ${fetchError.message}`);
    }

    const newReceivedQuantity = lineData.received_quantity + quantityChange;

    // Update received quantity
    const { error } = await supabase
      .from('raw_material_purchase_order_lines')
      .update({ received_quantity: newReceivedQuantity })
      .eq('id', poLineId);

    if (error) {
      throw new Error(`Failed to update purchase order line received quantity: ${error.message}`);
    }

    // Update purchase order status based on received quantities
    await this.updatePurchaseOrderStatus(poLineId);
  }

  private async updatePurchaseOrderStatus(poLineId: string): Promise<void> {
    // Get purchase order ID from the line
    const { data: lineData, error: fetchError } = await supabase
      .from('raw_material_purchase_order_lines')
      .select('purchase_order_id')
      .eq('id', poLineId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch purchase order line: ${fetchError.message}`);
    }

    // Get all lines for this purchase order
    const { data: allLines, error: linesError } = await supabase
      .from('raw_material_purchase_order_lines')
      .select('quantity, received_quantity')
      .eq('purchase_order_id', lineData.purchase_order_id);

    if (linesError) {
      throw new Error(`Failed to fetch purchase order lines: ${linesError.message}`);
    }

    const fullyReceived = allLines.every(line => line.received_quantity >= line.quantity);
    const partiallyReceived = allLines.some(line => line.received_quantity > 0);

    let newStatus: 'sent' | 'partial_received' | 'received' = 'sent';
    if (fullyReceived) {
      newStatus = 'received';
    } else if (partiallyReceived) {
      newStatus = 'partial_received';
    }

    const { error } = await supabase
      .from('raw_material_purchase_orders')
      .update({ status: newStatus })
      .eq('id', lineData.purchase_order_id);

    if (error) {
      throw new Error(`Failed to update purchase order status: ${error.message}`);
    }
  }

  private async updateRawMaterialInventory(materialId: string, quantityChange: number, unitCost: number): Promise<void> {
    const id = Number(materialId);
    // Schema with quantity_on_hand/quantity_available/quantity_reserved
    const { data: inventoryData, error: fetchError } = await supabase
      .from('raw_material_inventory')
      .select('quantity_on_hand, quantity_reserved, quantity_available, location')
      .eq('raw_material_id', id)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw new Error(`Failed to fetch inventory: ${fetchError.message}`);
    }

    const currentOnHand = inventoryData?.quantity_on_hand || 0;
    const currentReserved = inventoryData?.quantity_reserved || 0;
    const newOnHand = currentOnHand + quantityChange;
    const newAvailable = Math.max(0, newOnHand - currentReserved);

    let invWriteErr: any = null;
    if (inventoryData) {
      const { error } = await supabase
        .from('raw_material_inventory')
        .update({
          quantity_on_hand: newOnHand,
          quantity_available: newAvailable,
          location: inventoryData?.location ?? 'Default Warehouse',
          last_updated: new Date().toISOString(),
        })
        .eq('raw_material_id', id);
      invWriteErr = error;
    } else {
      const { error } = await supabase
        .from('raw_material_inventory')
        .insert({
          raw_material_id: id,
          quantity_on_hand: newOnHand,
          quantity_available: newAvailable,
          location: 'Default Warehouse',
          last_updated: new Date().toISOString(),
        });
      invWriteErr = error;
    }

    if (invWriteErr) {
      throw new Error(`Failed to update inventory: ${invWriteErr.message}`);
    }

    if (error) {
      throw new Error(`Failed to update inventory: ${error.message}`);
    }
  }

  async getPendingGoodsReceived(): Promise<GoodsReceived[]> {
    const { data, error } = await supabase
      .from('goods_received')
      .select('*')
      .in('status', ['pending', 'verified'])
      .order('received_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch pending goods received: ${error.message}`);
    }

    // Manually fetch related data for each goods received record
    const goodsReceivedWithDetails = await Promise.all(
      (data || []).map(async (gr) => {
        // Fetch purchase order with supplier
        const { data: poData } = await supabase
          .from('raw_material_purchase_orders')
          .select(`
            id, po_number,
            supplier:material_suppliers(id, name)
          `)
          .eq('id', gr.purchase_order_id)
          .single();

        // Fetch received by user
        const { data: userData } = await supabase
          .from('auth.users')
          .select('id, email')
          .eq('id', gr.received_by)
          .single();

        // Fetch goods received lines
        const { data: linesData } = await supabase
          .from('goods_received_lines')
          .select('*')
          .eq('goods_received_id', gr.id);

        // Fetch related data for each line
        const linesWithDetails = await Promise.all(
          (linesData || []).map(async (line) => {
            // Fetch raw material
            const { data: materialData } = await supabase
              .from('raw_materials')
              .select('id, name, code, base_unit, purchase_unit')
              .eq('id', line.raw_material_id)
              .single();

            // Fetch purchase order line
            const { data: poLineData } = await supabase
              .from('raw_material_purchase_order_lines')
              .select('id, quantity, received_quantity')
              .eq('id', line.purchase_order_line_id)
              .single();

            return {
              ...line,
              raw_material: materialData,
              purchase_order_line: poLineData
            };
          })
        );

        return {
          ...gr,
          purchase_order: {
            ...poData,
            supplier: Array.isArray(poData?.supplier) ? poData.supplier[0] : poData?.supplier
          },
          received_by_user: userData,
          lines: linesWithDetails
        };
      })
    );

    return goodsReceivedWithDetails;
  }
}
