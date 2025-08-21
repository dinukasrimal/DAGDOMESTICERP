import { supabase } from '@/integrations/supabase/client';

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: number;
  order_date: string;
  expected_delivery_date?: string;
  status: 'draft' | 'sent' | 'approved' | 'partial_received' | 'received' | 'cancelled';
  total_amount: number;
  total_quantity: number;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  supplier?: {
    id: number;
    name: string;
  };
  lines?: PurchaseOrderLine[];
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  raw_material_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  reference?: string;
  received_quantity: number;
  created_at: string;
  updated_at: string;
  raw_material?: {
    id: number;
    name: string;
    code?: string;
    base_unit: string;
    purchase_unit: string;
  };
}

export interface CreatePurchaseOrder {
  supplier_id: number;
  order_date: string;
  expected_delivery_date?: string;
  notes?: string;
  lines: CreatePurchaseOrderLine[];
}

export interface CreatePurchaseOrderLine {
  raw_material_id: number;
  quantity: number;
  unit_price: number;
  reference?: string;
}

export interface UpdatePurchaseOrder {
  supplier_id?: number;
  order_date?: string;
  expected_delivery_date?: string;
  status?: PurchaseOrder['status'];
  notes?: string;
}

export class PurchaseOrderService {
  async getAllPurchaseOrders(): Promise<PurchaseOrder[]> {

    const { data, error } = await supabase
      .from('raw_material_purchase_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch purchase orders: ${error.message}`);
    }

    // Manually fetch suppliers and lines for each purchase order
    const purchaseOrdersWithDetails = await Promise.all(
      (data || []).map(async (po) => {
        // Fetch supplier
        const { data: supplierData } = await supabase
          .from('material_suppliers')
          .select('id, name')
          .eq('id', po.supplier_id)
          .single();

        // Fetch lines
        const { data: linesData } = await supabase
          .from('raw_material_purchase_order_lines')
          .select('*')
          .eq('purchase_order_id', po.id);

        // Fetch materials for each line
        const linesWithMaterials = await Promise.all(
          (linesData || []).map(async (line) => {
            const { data: materialData } = await supabase
              .from('raw_materials')
              .select('id, name, code, base_unit, purchase_unit')
              .eq('id', line.raw_material_id)
              .single();

            return {
              ...line,
              raw_material: materialData
            };
          })
        );

        return {
          ...po,
          supplier: supplierData,
          lines: linesWithMaterials
        };
      })
    );

    return purchaseOrdersWithDetails;
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder> {
    const { data, error } = await supabase
      .from('raw_material_purchase_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch purchase order: ${error.message}`);
    }

    // Manually fetch supplier
    const { data: supplierData } = await supabase
      .from('material_suppliers')
      .select('id, name')
      .eq('id', data.supplier_id)
      .single();

    // Manually fetch lines
    const { data: linesData } = await supabase
      .from('raw_material_purchase_order_lines')
      .select('*')
      .eq('purchase_order_id', data.id);

    // Fetch materials for each line
    const linesWithMaterials = await Promise.all(
      (linesData || []).map(async (line) => {
        const { data: materialData } = await supabase
          .from('raw_materials')
          .select('id, name, code, base_unit, purchase_unit')
          .eq('id', line.raw_material_id)
          .single();

        return {
          ...line,
          raw_material: materialData
        };
      })
    );

    return {
      ...data,
      supplier: supplierData,
      lines: linesWithMaterials
    };
  }

  async createPurchaseOrder(purchaseOrder: CreatePurchaseOrder): Promise<PurchaseOrder> {
    try {
      console.log('Creating purchase order with data:', purchaseOrder);

      // Generate PO number using timestamp and date
      const currentDate = new Date();
      const yearMonth = currentDate.getFullYear().toString() + (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const timestamp = currentDate.getTime().toString().slice(-4); // Last 4 digits of timestamp
      const poNumber = `PO-${yearMonth}-${timestamp}`;

      console.log('Generated PO number:', poNumber);

      // Create purchase order
      const { data: poData, error: poError } = await supabase
        .from('raw_material_purchase_orders')
        .insert({
          po_number: poNumber,
          supplier_id: purchaseOrder.supplier_id,
          order_date: purchaseOrder.order_date,
          expected_delivery_date: purchaseOrder.expected_delivery_date || null,
          notes: purchaseOrder.notes,
          status: 'draft'
        })
        .select()
        .single();

      if (poError) {
        console.error('Error creating purchase order:', poError);
        throw new Error(`Failed to create purchase order: ${poError.message}`);
      }

      console.log('Created purchase order:', poData);

      // Create purchase order lines
      if (purchaseOrder.lines.length > 0) {
        const linesData = purchaseOrder.lines.map(line => ({
          purchase_order_id: poData.id,
          raw_material_id: line.raw_material_id,
          quantity: line.quantity,
          unit_price: line.unit_price,
          reference: line.reference
        }));

        console.log('Creating purchase order lines:', linesData);

        const { error: linesError } = await supabase
          .from('raw_material_purchase_order_lines')
          .insert(linesData);

        if (linesError) {
          console.error('Error creating purchase order lines:', linesError);
          throw new Error(`Failed to create purchase order lines: ${linesError.message}`);
        }
      }

      return this.getPurchaseOrder(poData.id);
    } catch (error) {
      console.error('Purchase order creation failed:', error);
      throw error;
    }
  }

  async updatePurchaseOrder(id: string, updates: UpdatePurchaseOrder): Promise<PurchaseOrder> {
    const { error } = await supabase
      .from('raw_material_purchase_orders')
      .update(updates)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update purchase order: ${error.message}`);
    }

    return this.getPurchaseOrder(id);
  }

  async updatePurchaseOrderStatus(id: string, status: PurchaseOrder['status']): Promise<void> {
    const { error } = await supabase
      .from('raw_material_purchase_orders')
      .update({ status })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update purchase order status: ${error.message}`);
    }
  }

  async deletePurchaseOrder(id: string): Promise<void> {
    const { error } = await supabase
      .from('raw_material_purchase_orders')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete purchase order: ${error.message}`);
    }
  }

  async getPendingPurchaseOrders(): Promise<PurchaseOrder[]> {
    const { data, error } = await supabase
      .from('raw_material_purchase_orders')
      .select('*')
      .in('status', ['approved', 'sent', 'partial_received'])
      .order('order_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch pending purchase orders: ${error.message}`);
    }

    // Manually fetch suppliers and lines for each purchase order
    const purchaseOrdersWithDetails = await Promise.all(
      (data || []).map(async (po) => {
        // Fetch supplier
        const { data: supplierData } = await supabase
          .from('material_suppliers')
          .select('id, name')
          .eq('id', po.supplier_id)
          .single();

        // Fetch lines
        const { data: linesData } = await supabase
          .from('raw_material_purchase_order_lines')
          .select('*')
          .eq('purchase_order_id', po.id);

        // Fetch materials for each line
        const linesWithMaterials = await Promise.all(
          (linesData || []).map(async (line) => {
            const { data: materialData } = await supabase
              .from('raw_materials')
              .select('id, name, code, base_unit, purchase_unit')
              .eq('id', line.raw_material_id)
              .single();

            return {
              ...line,
              raw_material: materialData
            };
          })
        );

        // Only return POs that have lines with pending deliveries
        const hasPendingLines = linesWithMaterials.some(line => line.received_quantity < line.quantity);
        
        if (hasPendingLines) {
          return {
            ...po,
            supplier: supplierData,
            lines: linesWithMaterials
          };
        }
        return null;
      })
    );

    return purchaseOrdersWithDetails.filter(po => po !== null) as PurchaseOrder[];
  }

  async updatePurchaseOrderLineReceived(lineId: string, quantityChange: number): Promise<void> {
    // Get current received quantity
    const { data: lineData, error: fetchError } = await supabase
      .from('raw_material_purchase_order_lines')
      .select('received_quantity, quantity')
      .eq('id', lineId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch purchase order line: ${fetchError.message}`);
    }

    const newReceivedQuantity = lineData.received_quantity + quantityChange;

    // Update received quantity
    const { error } = await supabase
      .from('raw_material_purchase_order_lines')
      .update({ received_quantity: newReceivedQuantity })
      .eq('id', lineId);

    if (error) {
      throw new Error(`Failed to update purchase order line received quantity: ${error.message}`);
    }
  }
}