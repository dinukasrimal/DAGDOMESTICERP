import { supabase } from '@/integrations/supabase/client';

export type IssueReturnType = 'trims' | 'cut';

export interface IssueReturnHeader {
  id: string;
  return_number: string;
  return_type: IssueReturnType;
  supplier_id?: number | null;
  supplier_name?: string | null;
  po_id?: string | null;
  purchase_po_number?: string | null;
  return_date: string;
  notes?: string | null;
  created_at: string;
}

export interface IssueReturnLine {
  id: string;
  issue_return_id: string;
  goods_issue_line_id?: string | null;
  cut_issue_record_id?: string | null;
  raw_material_id?: number | null;
  quantity: number;
  counts_inventory: boolean;
}

class IssueReturnService {
  private async generateReturnNumber(): Promise<string> {
    try {
      const today = new Date();
      const ym = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
      const { data } = await supabase
        .from('issue_returns')
        .select('return_number')
        .ilike('return_number', `IRN-${ym}-%`)
        .order('created_at', { ascending: false })
        .limit(1);
      let next = 1;
      if (data && data.length) {
        const match = data[0].return_number.match(/IRN-\d{6}-(\d{4})/);
        if (match && match[1]) next = (parseInt(match[1], 10) || 0) + 1;
      }
      return `IRN-${ym}-${String(next).padStart(4, '0')}`;
    } catch {
      return `IRN-${Date.now().toString().slice(-8)}`;
    }
  }

  async createHeader(params: { return_type: IssueReturnType; supplier_id?: number | null; supplier_name?: string | null; po_id?: string | null; po_number?: string | null; notes?: string | null }): Promise<IssueReturnHeader> {
    const return_number = await this.generateReturnNumber();
    const { data, error } = await supabase
      .from('issue_returns')
      .insert({
        return_number,
        return_type: params.return_type,
        supplier_id: params.supplier_id ?? null,
        supplier_name: params.supplier_name ?? null,
        po_id: params.po_id ?? null,
        purchase_po_number: params.po_number ?? null,
        notes: params.notes ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(`Failed to create issue return header: ${error.message}`);
    return data as IssueReturnHeader;
  }

  async addLines(headerId: string, lines: Array<{ goods_issue_line_id?: string | null; cut_issue_record_id?: string | null; raw_material_id?: number | null; quantity: number; counts_inventory: boolean }>): Promise<void> {
    if (!lines.length) return;
    const payload = lines.map(line => ({
      issue_return_id: headerId,
      goods_issue_line_id: line.goods_issue_line_id ?? null,
      cut_issue_record_id: line.cut_issue_record_id ?? null,
      raw_material_id: line.raw_material_id ?? null,
      quantity: line.quantity,
      counts_inventory: line.counts_inventory,
    }));
    const { error } = await supabase.from('issue_return_lines').insert(payload);
    if (error) throw new Error(`Failed to save issue return lines: ${error.message}`);
  }

  async listReturns(): Promise<Array<IssueReturnHeader & { supplier_display_name?: string; po_number?: string; return_type: IssueReturnType; line_count: number }>> {
    const { data, error } = await supabase
      .from('issue_returns')
      .select('id, return_number, return_type, supplier_id, supplier_name, po_id, purchase_po_number, return_date, notes, created_at')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to load issue returns: ${error.message}`);
    const headers = (data || []) as IssueReturnHeader[];
    if (!headers.length) return [];

    const supplierIds = Array.from(new Set(headers.map(h => h.supplier_id).filter((id): id is number => typeof id === 'number')));
    const poIds = Array.from(new Set(headers.map(h => h.po_id).filter((id): id is string => typeof id === 'string' && id.length > 0)));

    const [{ data: suppliers }, { data: pos }, { data: lines }] = await Promise.all([
      supplierIds.length ? supabase.from('material_suppliers').select<{ id: number; name: string }>('id, name').in('id', supplierIds) : Promise.resolve<{ data: { id: number; name: string }[] | null }>({ data: [] }),
      poIds.length ? supabase.from('raw_material_purchase_orders').select<{ id: string; po_number: string | null }>('id, po_number').in('id', poIds) : Promise.resolve<{ data: { id: string; po_number: string | null }[] | null }>({ data: [] }),
      supabase.from('issue_return_lines').select<{ issue_return_id: string }>('issue_return_id').in('issue_return_id', headers.map(h => h.id)),
    ]);
    const supplierMap = new Map((suppliers || []).map(s => [s.id, s.name]));
    const poMap = new Map((pos || []).map(p => [p.id, p.po_number || undefined]));
    const countMap = new Map<string, number>();
    (lines || []).forEach(row => {
      const key = row.issue_return_id;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    });

    return headers.map(h => {
      const supplierName = h.supplier_name ?? (h.supplier_id ? supplierMap.get(h.supplier_id) : undefined);
      const poNumber = h.purchase_po_number ?? (h.po_id ? poMap.get(h.po_id) : undefined);
      return {
        ...h,
        supplier_display_name: supplierName,
        po_number: poNumber,
        line_count: countMap.get(h.id) || 0,
        return_type: h.return_type,
      };
    });
  }
}

export const issueReturnService = new IssueReturnService();
