export interface MarkerPurchaseOrderLine {
  id: string | number;
  product_name?: string;
  product_id?: string | number;
  product_qty?: number;
  qty_received?: number;
  qty_delivered?: number;
  qty_done?: number;
  pending_qty?: number;
  reference?: string | null;
}

export interface MarkerPurchaseOrder {
  id: string | number;
  name: string;
  partner_name?: string;
  date_order?: string;
  state?: string;
  po_number: string;
  pending_qty?: number;
  order_lines?: MarkerPurchaseOrderLine[];
}

export type FabricUsageOption = 'body' | 'gusset_1' | 'gusset_2';

export interface MarkerFabricAssignment {
  bom_id: string;
  bom_name?: string | null;
  fabric_usage: FabricUsageOption;
  raw_material_id?: number | null;
  raw_material_name?: string | null;
  product_id?: number | null;
  product_name?: string | null;
  po_id?: string;
  po_number?: string;
}
