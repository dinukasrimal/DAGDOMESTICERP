import { supabase } from '@/integrations/supabase/client';

export interface MarkerReturnHeader {
  id: string;
  return_number: string;
  marker_id: string;
  purchase_order_id?: string | null;
  return_date: string;
  notes?: string | null;
  created_at: string;
}

export interface MarkerReturnLine {
  id: string;
  marker_return_id: string;
  raw_material_id: number;
  quantity: number;
  unit?: string | null;
  unit_price?: number | null;
  barcodes?: string[] | null;
}

class MarkerReturnService {
  async generateReturnNumber(): Promise<string> {
    try {
      const today = new Date();
      const ym = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
      const { data } = await supabase
        .from('marker_returns')
        .select('return_number')
        .ilike('return_number', `MRN-${ym}-%`)
        .order('created_at', { ascending: false })
        .limit(1);
      let next = 1;
      if (data && data.length) {
        const match = data[0].return_number.match(/MRN-\d{6}-(\d{4})/);
        if (match && match[1]) next = (parseInt(match[1], 10) || 0) + 1;
      }
      return `MRN-${ym}-${String(next).padStart(4, '0')}`;
    } catch {
      return `MRN-${Date.now().toString().slice(-8)}`;
    }
  }

  async createHeader(params: { marker_id: string; purchase_order_id?: string | null; notes?: string | null }): Promise<MarkerReturnHeader> {
    const return_number = await this.generateReturnNumber();
    const { data, error } = await supabase
      .from('marker_returns')
      .insert({
        return_number,
        marker_id: params.marker_id,
        purchase_order_id: params.purchase_order_id || null,
        notes: params.notes || null,
      })
      .select('*')
      .single();
    if (error) throw new Error(`Failed to create marker return: ${error.message}`);
    return data as MarkerReturnHeader;
  }

  async addLines(headerId: string, lines: Array<{ raw_material_id: number; quantity: number; unit?: string | null; unit_price?: number | null; barcodes?: string[] | null }>): Promise<void> {
    if (!lines.length) return;
    const payload = lines.map(line => ({
      marker_return_id: headerId,
      raw_material_id: line.raw_material_id,
      quantity: line.quantity,
      unit: line.unit || null,
      unit_price: line.unit_price || null,
      barcodes: line.barcodes && line.barcodes.length ? line.barcodes : null,
    }));
    const { error } = await supabase.from('marker_return_lines').insert(payload);
    if (error) throw new Error(`Failed to save marker return lines: ${error.message}`);
  }

  async listReturns(): Promise<Array<MarkerReturnHeader & { marker_number?: string; po_number?: string; line_count: number }>> {
    const { data, error } = await supabase
      .from('marker_returns')
      .select('id, return_number, marker_id, purchase_order_id, return_date, notes, created_at');
    if (error) throw new Error(`Failed to load marker returns: ${error.message}`);
    const headers = (data || []) as MarkerReturnHeader[];
    if (!headers.length) return [];

    const markerIds = Array.from(new Set(headers.map(h => h.marker_id)));
    const poIds = Array.from(new Set(headers.map(h => h.purchase_order_id).filter(Boolean))) as string[];

    const [{ data: markers }, { data: pos }, { data: lines }] = await Promise.all([
      markerIds.length
        ? supabase.from('marker_requests').select<{ id: string; marker_number: string | null }>('id, marker_number').in('id', markerIds)
        : Promise.resolve<{ data: { id: string; marker_number: string | null }[] | null }>({ data: [] }),
      poIds.length
        ? supabase.from('raw_material_purchase_orders').select<{ id: string; po_number: string | null }>('id, po_number').in('id', poIds)
        : Promise.resolve<{ data: { id: string; po_number: string | null }[] | null }>({ data: [] }),
      supabase.from('marker_return_lines').select<{ marker_return_id: string }>('marker_return_id'),
    ]);

    const markerMap = new Map((markers || []).map(m => [m.id, m.marker_number || undefined]));
    const poMap = new Map((pos || []).map(p => [p.id, p.po_number || undefined]));
    const countMap = new Map<string, number>();
    (lines || []).forEach(row => {
      const key = row.marker_return_id;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    });

    return headers.map(h => ({
      ...h,
      marker_number: markerMap.get(h.marker_id),
      po_number: h.purchase_order_id ? poMap.get(h.purchase_order_id) : undefined,
      line_count: countMap.get(h.id) || 0,
    }));
  }
}

export const markerReturnService = new MarkerReturnService();
