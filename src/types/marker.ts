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
