import { supabase } from '@/integrations/supabase/client';

export interface SupplierReturnHeader {
  id: string;
  return_number: string;
  po_id: string;
  supplier_id: number;
  return_date: string;
  notes?: string;
  created_at: string;
}

export interface SupplierReturnLine {
  id: string;
  supplier_return_id: string;
  raw_material_id: number;
  quantity: number;
  unit?: string;
  unit_price?: number;
  barcodes?: string[];
}

export class SupplierReturnService {
  async generateReturnNumber(): Promise<string> {
    try {
      // Try to emulate GRN pattern: RTN-YYYYMM-NNNN
      const today = new Date();
      const ym = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}`;
      // Query last number matching RTN-YYYYMM-####
      const { data } = await supabase
        .from('supplier_returns')
        .select('return_number')
        .ilike('return_number', `RTN-${ym}-%`)
        .order('created_at', { ascending: false })
        .limit(1);
      let next = 1;
      if (data && data.length) {
        const last = data[0].return_number;
        const m = last.match(/RTN-\d{6}-(\d{4})/);
        if (m && m[1]) next = (parseInt(m[1], 10) || 0) + 1;
      }
      return `RTN-${ym}-${String(next).padStart(4,'0')}`;
    } catch {
      return `RTN-${Date.now().toString().slice(-8)}`;
    }
  }

  async createHeader(params: { po_id: string, supplier_id: number, notes?: string }): Promise<SupplierReturnHeader> {
    const return_number = await this.generateReturnNumber();
    const { data, error } = await supabase
      .from('supplier_returns')
      .insert({ return_number, po_id: params.po_id, supplier_id: params.supplier_id, notes: params.notes || null })
      .select('*')
      .single();
    if (error) throw new Error(`Failed to create return header: ${error.message}`);
    return data as SupplierReturnHeader;
  }

  async addLines(headerId: string, lines: Array<{ raw_material_id: number, quantity: number, unit?: string, unit_price?: number, barcodes?: string[] }>): Promise<void> {
    if (!lines.length) return;
    const rows = lines.map(l => ({ supplier_return_id: headerId, raw_material_id: l.raw_material_id, quantity: l.quantity, unit: l.unit || null, unit_price: l.unit_price || null, barcodes: l.barcodes && l.barcodes.length ? l.barcodes : null }));
    const { error } = await supabase.from('supplier_return_lines').insert(rows);
    if (error) throw new Error(`Failed to save return lines: ${error.message}`);
  }

  async listReturns(): Promise<Array<SupplierReturnHeader & { supplier_name?: string, po_number?: string, line_count: number }>> {
    const { data, error } = await supabase
      .from('supplier_returns')
      .select('id, return_number, po_id, supplier_id, return_date, notes, created_at');
    if (error) throw new Error(`Failed to load returns: ${error.message}`);
    const headers = (data || []) as SupplierReturnHeader[];
    if (!headers.length) return [];
    // Augment with supplier/PO and line counts
    const poIds = Array.from(new Set(headers.map(h => h.po_id)));
    const supplierIds = Array.from(new Set(headers.map(h => h.supplier_id)));
    const [{ data: pos }, { data: sups }, { data: lines }] = await Promise.all([
      supabase.from('raw_material_purchase_orders').select<{ id: string; po_number: string | null }>('id, po_number').in('id', poIds),
      supabase.from('material_suppliers').select<{ id: number; name: string }>('id, name').in('id', supplierIds),
      supabase.from('supplier_return_lines').select<{ supplier_return_id: string }>('supplier_return_id').in('supplier_return_id', headers.map(h => h.id)),
    ]);
    const poMap = new Map((pos || []).map(p => [p.id, p.po_number || undefined]));
    const supMap = new Map((sups || []).map(s => [s.id, s.name]));
    const cntMap = new Map<string, number>();
    (lines || []).forEach(row => {
      const key = row.supplier_return_id;
      cntMap.set(key, (cntMap.get(key) || 0) + 1);
    });
    return headers.map(h => ({ ...h, po_number: poMap.get(h.po_id), supplier_name: supMap.get(h.supplier_id), line_count: cntMap.get(h.id) || 0 }));
  }
}

export const supplierReturnService = new SupplierReturnService();
