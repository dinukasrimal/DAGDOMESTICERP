import { supabase } from '@/integrations/supabase/client';

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  order_date: string;
  expected_delivery_date?: string;
  status: 'pending' | 'approved' | 'sent' | 'partial_received' | 'received' | 'cancelled';
  total_amount?: number;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  supplier?: {
    id: string;
    name: string;
    contact_person?: string;
    email?: string;
    phone?: string;
  };
  lines?: PurchaseOrderLine[];
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  raw_material_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  received_quantity: number;
  created_at: string;
  updated_at: string;
  raw_material?: {
    id: string;
    name: string;
    code?: string;
    base_unit: string;
    purchase_unit: string;
  };
}

export interface CreatePurchaseOrder {
  supplier_id: string;
  order_date: string;
  expected_delivery_date?: string;
  notes?: string;
  lines: CreatePurchaseOrderLine[];
}

export interface CreatePurchaseOrderLine {
  raw_material_id: string;
  quantity: number;
  unit_price: number;
}

export interface UpdatePurchaseOrder {
  supplier_id?: string;
  order_date?: string;
  expected_delivery_date?: string;
  status?: PurchaseOrder['status'];
  notes?: string;
}

export class PurchaseOrderService {
  async getAllPurchaseOrders(): Promise<PurchaseOrder[]> {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers(id, name, contact_person, email, phone),
        lines:purchase_order_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch purchase orders: ${error.message}`);
    }

    return data || [];
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder> {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers(id, name, contact_person, email, phone),
        lines:purchase_order_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch purchase order: ${error.message}`);
    }

    return data;
  }

  async createPurchaseOrder(purchaseOrder: CreatePurchaseOrder): Promise<PurchaseOrder> {
    // Generate PO number
    const { data: poNumberData, error: poNumberError } = await supabase
      .rpc('generate_po_number');

    if (poNumberError) {
      throw new Error(`Failed to generate PO number: ${poNumberError.message}`);
    }

    // Calculate total amount
    const totalAmount = purchaseOrder.lines.reduce((sum, line) => 
      sum + (line.quantity * line.unit_price), 0
    );

    // Create purchase order
    const { data: poData, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        po_number: poNumberData,
        supplier_id: purchaseOrder.supplier_id,
        order_date: purchaseOrder.order_date,
        expected_delivery_date: purchaseOrder.expected_delivery_date,
        total_amount: totalAmount,
        notes: purchaseOrder.notes,
      })
      .select()
      .single();

    if (poError) {
      throw new Error(`Failed to create purchase order: ${poError.message}`);
    }

    // Create purchase order lines
    const linesData = purchaseOrder.lines.map(line => ({
      purchase_order_id: poData.id,
      raw_material_id: line.raw_material_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
    }));

    const { error: linesError } = await supabase
      .from('purchase_order_lines')
      .insert(linesData);

    if (linesError) {
      throw new Error(`Failed to create purchase order lines: ${linesError.message}`);
    }

    return this.getPurchaseOrder(poData.id);
  }

  async updatePurchaseOrder(id: string, updates: UpdatePurchaseOrder): Promise<PurchaseOrder> {
    const { error } = await supabase
      .from('purchase_orders')
      .update(updates)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update purchase order: ${error.message}`);
    }

    return this.getPurchaseOrder(id);
  }

  async deletePurchaseOrder(id: string): Promise<void> {
    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete purchase order: ${error.message}`);
    }
  }

  async addPurchaseOrderLine(purchaseOrderId: string, line: CreatePurchaseOrderLine): Promise<void> {
    const { error } = await supabase
      .from('purchase_order_lines')
      .insert({
        purchase_order_id: purchaseOrderId,
        raw_material_id: line.raw_material_id,
        quantity: line.quantity,
        unit_price: line.unit_price,
      });

    if (error) {
      throw new Error(`Failed to add purchase order line: ${error.message}`);
    }

    // Update total amount
    await this.updatePurchaseOrderTotal(purchaseOrderId);
  }

  async updatePurchaseOrderLine(lineId: string, updates: Partial<CreatePurchaseOrderLine>): Promise<void> {
    const { data: lineData, error: lineError } = await supabase
      .from('purchase_order_lines')
      .update(updates)
      .eq('id', lineId)
      .select('purchase_order_id')
      .single();

    if (lineError) {
      throw new Error(`Failed to update purchase order line: ${lineError.message}`);
    }

    // Update total amount
    await this.updatePurchaseOrderTotal(lineData.purchase_order_id);
  }

  async deletePurchaseOrderLine(lineId: string): Promise<void> {
    // Get PO ID before deleting
    const { data: lineData, error: fetchError } = await supabase
      .from('purchase_order_lines')
      .select('purchase_order_id')
      .eq('id', lineId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch purchase order line: ${fetchError.message}`);
    }

    const { error } = await supabase
      .from('purchase_order_lines')
      .delete()
      .eq('id', lineId);

    if (error) {
      throw new Error(`Failed to delete purchase order line: ${error.message}`);
    }

    // Update total amount
    await this.updatePurchaseOrderTotal(lineData.purchase_order_id);
  }

  private async updatePurchaseOrderTotal(purchaseOrderId: string): Promise<void> {
    // Calculate new total
    const { data: lines, error: linesError } = await supabase
      .from('purchase_order_lines')
      .select('quantity, unit_price')
      .eq('purchase_order_id', purchaseOrderId);

    if (linesError) {
      throw new Error(`Failed to calculate total: ${linesError.message}`);
    }

    const totalAmount = lines.reduce((sum, line) => 
      sum + (line.quantity * line.unit_price), 0
    );

    // Update purchase order total
    const { error } = await supabase
      .from('purchase_orders')
      .update({ total_amount: totalAmount })
      .eq('id', purchaseOrderId);

    if (error) {
      throw new Error(`Failed to update purchase order total: ${error.message}`);
    }
  }

  async getPendingPurchaseOrders(): Promise<PurchaseOrder[]> {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers(id, name, contact_person, email, phone),
        lines:purchase_order_lines(
          *,
          raw_material:raw_materials(id, name, code, base_unit, purchase_unit)
        )
      `)
      .in('status', ['pending', 'approved', 'sent', 'partial_received'])
      .order('order_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch pending purchase orders: ${error.message}`);
    }

    return data || [];
  }

  async updatePurchaseOrderStatus(id: string, status: PurchaseOrder['status']): Promise<void> {
    const { error } = await supabase
      .from('purchase_orders')
      .update({ status })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update purchase order status: ${error.message}`);
    }
  }
}