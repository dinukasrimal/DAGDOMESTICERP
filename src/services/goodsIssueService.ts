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
  private async consumeInventoryLayersDetailed(materialId: number, requiredQty: number): Promise<{ avgCost: number, breakdown: { layerId: string, qty: number, unit_price: number }[] }> {
    // FIFO over raw_material_inventory GRN rows; decrement layer quantities; return per-layer consumption
    let remaining = requiredQty;
    let costAccum = 0;
    let qtyAccum = 0;

    const { data: rows, error } = await supabase
      .from('raw_material_inventory')
      .select('id, quantity_on_hand, quantity_available, unit_price, last_updated, transaction_type')
      .eq('raw_material_id', materialId)
      .or('transaction_type.is.null,transaction_type.eq.grn');
    if (error) throw new Error(`Failed to load inventory for FIFO: ${error.message}`);

    const layers = (rows || [])
      .map((r: any) => {
        const qty = Number(r.quantity_available ?? r.quantity_on_hand ?? 0);
        const cost = Number(r.unit_price ?? 0);
        const ts = r.last_updated || '1970-01-01T00:00:00Z';
        return { id: r.id as string, qty, cost, ts };
      })
      .filter(l => l.qty > 0)
      .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));

    const updates: { id: string; newQtyAvail: number; newQtyOnHand: number; take: number; unit_price: number }[] = [];

    for (const layer of layers) {
      if (remaining <= 0) break;
      const take = Math.min(layer.qty, remaining);
      if (take > 0) {
        remaining -= take;
        qtyAccum += take;
        costAccum += take * layer.cost;
        updates.push({ id: layer.id, newQtyAvail: layer.qty - take, newQtyOnHand: layer.qty - take, take, unit_price: layer.cost });
      }
    }

    if (remaining > 0) {
      throw new Error('Insufficient inventory layers for FIFO consumption');
    }

    // Persist updates back to raw_material_inventory (do not change last_updated to preserve FIFO order)
    for (const u of updates) {
      const { error: updErr } = await supabase
        .from('raw_material_inventory')
        .update({ quantity_available: u.newQtyAvail, quantity_on_hand: u.newQtyOnHand })
        .eq('id', u.id);
      if (updErr) throw new Error(`Failed to update inventory layer: ${updErr.message}`);
    }

    return { avgCost: qtyAccum > 0 ? costAccum / qtyAccum : 0, breakdown: updates.map(u => ({ layerId: u.id, qty: u.take, unit_price: u.unit_price })) };
  }
  private async consumeInventoryLayers(materialId: number, requiredQty: number): Promise<number> {
    const res = await this.consumeInventoryLayersDetailed(materialId, requiredQty);
    return res.avgCost;
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
      // Fallback: derive issues from raw_material_inventory negative rows.
      // Prefer rows marked with transaction_type='issue' and transaction_ref as issue number.
      let invRows: any[] = [];
      try {
        const { data } = await supabase
          .from('raw_material_inventory')
          .select('raw_material_id, quantity_on_hand, quantity_available, unit_price, last_updated, location, transaction_type, transaction_ref, po_number')
          .or('quantity_on_hand.lt.0,quantity_available.lt.0')
          .order('last_updated', { ascending: false });
        invRows = data || [];
      } catch {}
      const groups = new Map<string, any[]>();
      for (const r of invRows) {
        const type = (r as any).transaction_type;
        if (type && type !== 'issue') continue;
        const issueNum = (r as any).transaction_ref || 'GI-UNKNOWN';
        const qoh = Number((r as any).quantity_on_hand || 0);
        const qav = Number((r as any).quantity_available || 0);
        if (qoh >= 0 && qav >= 0) continue; // ensure negative rows only
        const arr = groups.get(issueNum) || [];
        arr.push(r);
        groups.set(issueNum, arr);
      }
      // Fetch material names
      const matIds = Array.from(new Set((invRows || []).map((r: any) => Number(r.raw_material_id)).filter(Boolean)));
      let matsMap = new Map<number, any>();
      if (matIds.length) {
        const { data: mats } = await supabase.from('raw_materials').select('id, name, code, base_unit').in('id', matIds);
        matsMap = new Map((mats || []).map((m: any) => [Number(m.id), m]));
      }
      const issues: GoodsIssue[] = Array.from(groups.entries()).map(([issueNum, rows]) => {
        const last = rows.reduce((a: any, b: any) => (a.last_updated > b.last_updated ? a : b));
        const id = `inv-${issueNum}`;
        // Derive a PO number if available in any of the grouped rows
        const poCandidates = Array.from(new Set(rows.map((r: any) => (r.po_number || '').toString()).filter((s: string) => !!s)));
        const poNumber = poCandidates.length === 1 ? poCandidates[0] : (poCandidates[0] || undefined);
        // Derive CATEGORY_TOTALS from any embedded string in location
        let headerNotes: string | undefined = undefined;
        try {
          for (const r of rows) {
            const loc = (r as any).location || '';
            const m = loc.match(/CATEGORY_TOTALS\s*:\s*([^|]+(?:\|[^|]+)*)/i);
            if (m && m[0]) { headerNotes = m[0].trim(); break; }
          }
        } catch {}
        const lines: GoodsIssueLine[] = rows.map((r: any, idx: number) => {
          const mid = String(r.raw_material_id);
          const qty = Math.abs(Number(r.quantity_available ?? r.quantity_on_hand ?? 0));
          const mat = matsMap.get(Number(mid));
          const wkg = Number((r as any).weight_kg || 0);
          const weightNote = !isNaN(wkg) && wkg > 0 ? `Weight: ${wkg} kg` : '';
          let recoveredNote: string | undefined;
          try {
            const loc = (r as any).location || '';
            const encodedMatch = loc.match(/LINE_NOTE:([^|]+)/i);
            if (encodedMatch && encodedMatch[1]) {
              recoveredNote = decodeURIComponent(encodedMatch[1]);
            } else {
              const rawMatch = loc.match(/LINE_NOTE_RAW:([^|]+)/i);
              if (rawMatch && rawMatch[1]) recoveredNote = rawMatch[1];
            }
          } catch {}
          let finalNote = recoveredNote || '';
          if (weightNote) {
            finalNote = finalNote ? `${finalNote} | ${weightNote}` : weightNote;
          }
          return {
            id: `${id}-line-${idx}`,
            goods_issue_id: id,
            raw_material_id: mid,
            quantity_issued: qty,
            unit_cost: Number(r.unit_price || 0),
            batch_number: '',
            notes: finalNote,
            created_at: r.last_updated,
            raw_material: mat ? { id: String(mat.id), name: mat.name, code: mat.code, base_unit: mat.base_unit } : undefined,
          } as any;
        });
        return {
          id,
          issue_number: issueNum,
          issue_date: (last.last_updated || new Date().toISOString()).split('T')[0],
          issue_type: 'production',
          reference_number: poNumber,
          status: 'issued',
          notes: headerNotes,
          created_at: last.last_updated,
          updated_at: last.last_updated,
          lines,
        } as any;
      });
      return issues;
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
    // Generate issue number (no DB dependency)
    let generatedNumber: string;
    try {
      const { data: nextNumber } = await supabase.rpc('generate_issue_number');
      generatedNumber = (nextNumber as unknown as string) || `GI${Date.now().toString().slice(-8)}`;
    } catch {
      generatedNumber = `GI${Date.now().toString().slice(-8)}`;
    }

    // Validate and immediately issue via FIFO directly against raw_material_inventory
    const costByMaterial = new Map<string, number>();
    // Extract CATEGORY_TOTALS (if present) from header notes to persist into ledger rows
    let categoryTotalsLine: string | null = null;
    try {
      const m = (goodsIssue.notes || '').toString().match(/CATEGORY_TOTALS\s*:\s*([^\n]+)/i);
      if (m && m[1]) categoryTotalsLine = `CATEGORY_TOTALS: ${m[1]}`;
    } catch {}

    const parseKgAndFactor = (notes?: string): { kg: number | null; factor: number | null } => {
      try {
        const txt = (notes || '').toString();
        // Match patterns like: "Weight: 12.5 kg"
        const mWeight = txt.match(/Weight\s*\(?(?:kg)?\)?\s*[:=]\s*([\d.]+)/i);
        if (mWeight && mWeight[1]) return { kg: parseFloat(mWeight[1]) || 0, factor: null };
        // Match patterns like: "Issued via alt unit: 5 kg (1 kg = 13.92 yards)"
        const mAlt = txt.match(/Issued\s+via\s+alt\s+unit\s*:\s*([\d.]+)\s*kg.*?1\s*kg\s*=\s*([\d.]+)/i);
        if (mAlt && mAlt[1]) {
          const kg = parseFloat(mAlt[1]) || 0;
          const factor = mAlt[2] ? (parseFloat(mAlt[2]) || null) : null;
          return { kg, factor };
        }
      } catch {}
      return { kg: null, factor: null };
    };

    for (const line of goodsIssue.lines || []) {
      await this.validateInventoryAvailability(line.raw_material_id, line.quantity_issued);
      const { avgCost, breakdown } = await this.consumeInventoryLayersDetailed(Number(line.raw_material_id), Number(line.quantity_issued));
      costByMaterial.set(String(line.raw_material_id), avgCost);
      const now = new Date().toISOString();
      // Write one negative row per layer consumed to preserve exact FIFO pricing in ledger
      if (breakdown.length) {
        // Parse optional weight_kg and kg_conversion_factor from line notes
        const parsed = parseKgAndFactor(line.notes);
        const weightKgVal = parsed.kg != null ? Math.max(0, parsed.kg) : null;
        const kgFactorVal = parsed.factor != null ? Math.max(0, parsed.factor) : null;
        const baseLocationParts: string[] = ['Default Warehouse'];
        if (categoryTotalsLine) baseLocationParts.push(categoryTotalsLine);
        if (line.notes) {
          try {
            const encoded = encodeURIComponent(line.notes);
            baseLocationParts.push(`LINE_NOTE:${encoded}`);
          } catch {
            // If encoding fails, fall back to raw note (best effort)
            baseLocationParts.push(`LINE_NOTE_RAW:${line.notes}`);
          }
        }
        const locationWithMetadata = baseLocationParts.join(' | ');

        const rowsBase = breakdown.map(slice => ({
          raw_material_id: Number(line.raw_material_id),
          quantity_on_hand: -Number(slice.qty),
          quantity_available: -Number(slice.qty),
          quantity_reserved: 0,
          unit_price: slice.unit_price,
          inventory_value: -Number(slice.qty) * Number(slice.unit_price || 0),
          // Embed metadata (category totals + line notes) into location so fallback reconstruction can recover requirements
          location: locationWithMetadata,
          transaction_type: 'issue',
          transaction_ref: generatedNumber,
          last_updated: now,
          // New explicit weight capture columns (if present in schema)
          weight_kg: weightKgVal,
          kg_conversion_factor: kgFactorVal,
        }));
        // Try to include po_number if column exists
        const poNumber = goodsIssue.reference_number || null;
        let insErr: any = null;
        if (poNumber) {
          let rowsWithPo: any[] = (rowsBase as any).map((r: any) => ({ ...r, po_number: poNumber }));
          let res = await supabase.from('raw_material_inventory').insert(rowsWithPo as any);
          insErr = res.error;
          if (insErr) {
            const msg = String(insErr.message || '').toLowerCase();
            // Retry dropping unknown columns progressively: kg columns then po_number
            if (msg.includes('column') && (msg.includes('weight_kg') || msg.includes('kg_conversion_factor'))) {
              rowsWithPo = rowsWithPo.map((r: any) => ({ po_number: r.po_number, last_updated: r.last_updated, transaction_ref: r.transaction_ref, transaction_type: r.transaction_type, location: r.location, inventory_value: r.inventory_value, unit_price: r.unit_price, quantity_reserved: r.quantity_reserved, quantity_available: r.quantity_available, quantity_on_hand: r.quantity_on_hand, raw_material_id: r.raw_material_id }));
              let res2 = await supabase.from('raw_material_inventory').insert(rowsWithPo as any);
              insErr = res2.error;
            }
            if (insErr && msg.includes('column') && msg.includes('po_number')) {
              const res3 = await supabase.from('raw_material_inventory').insert(rowsBase as any);
              insErr = res3.error;
              if (insErr && String(insErr.message || '').toLowerCase().includes('weight_kg')) {
                const trimmed = (rowsBase as any).map((r: any) => ({ last_updated: r.last_updated, transaction_ref: r.transaction_ref, transaction_type: r.transaction_type, location: r.location, inventory_value: r.inventory_value, unit_price: r.unit_price, quantity_reserved: r.quantity_reserved, quantity_available: r.quantity_available, quantity_on_hand: r.quantity_on_hand, raw_material_id: r.raw_material_id }));
                const res4 = await supabase.from('raw_material_inventory').insert(trimmed as any);
                insErr = res4.error;
              }
            }
          }
        } else {
          let res = await supabase.from('raw_material_inventory').insert(rowsBase as any);
          insErr = res.error;
          if (insErr && String(insErr.message || '').toLowerCase().includes('column') && (String(insErr.message || '').toLowerCase().includes('weight_kg') || String(insErr.message || '').toLowerCase().includes('kg_conversion_factor'))) {
            const trimmed = (rowsBase as any).map((r: any) => ({ last_updated: r.last_updated, transaction_ref: r.transaction_ref, transaction_type: r.transaction_type, location: r.location, inventory_value: r.inventory_value, unit_price: r.unit_price, quantity_reserved: r.quantity_reserved, quantity_available: r.quantity_available, quantity_on_hand: r.quantity_on_hand, raw_material_id: r.raw_material_id }));
            const res2 = await supabase.from('raw_material_inventory').insert(trimmed as any);
            insErr = res2.error;
          }
        }
        if (insErr) {
          const msg = (insErr as any)?.message || JSON.stringify(insErr);
          throw new Error(`Failed to write inventory outflow: ${msg}`);
        }
      }
    }

    // Attempt to persist header + lines (best-effort). Fall back to mock object if tables absent.
    try {
      const { data: header, error: headErr } = await supabase
        .from('goods_issue')
        .insert([{
          issue_number: generatedNumber,
          issue_date: goodsIssue.issue_date,
          issue_type: goodsIssue.issue_type,
          reference_number: goodsIssue.reference_number || null,
          status: 'issued',
          notes: goodsIssue.notes || null,
        }])
        .select('*')
        .single();
      if (!headErr && header) {
        const headerId = (header as any).id as string;
        // Insert lines
        const lineRows = (goodsIssue.lines || []).map((line) => ({
          goods_issue_id: headerId,
          raw_material_id: Number(line.raw_material_id),
          quantity_issued: Number(line.quantity_issued),
          unit_cost: costByMaterial.get(String(line.raw_material_id)) ?? line.unit_cost ?? null,
          batch_number: line.batch_number || null,
          notes: line.notes || null,
        }));
        if (lineRows.length) {
          const { error: lineErr } = await supabase.from('goods_issue_lines').insert(lineRows as any);
          if (lineErr) {
            // Non-fatal; continue
            console.warn('Failed to insert goods_issue_lines:', lineErr);
          }
        }
        // Return canonical row with attached lines
        const persisted = await this.getGoodsIssue(headerId);
        return persisted;
      }
    } catch (e) {
      // Ignore and fall back to mock below
    }

    // Compose a mock issued object for UI continuity (no separate tables)
    const mockIssue: GoodsIssue = {
      id: 'issue-' + Date.now(),
      issue_number: generatedNumber,
      issue_date: goodsIssue.issue_date,
      issue_type: goodsIssue.issue_type,
      reference_number: goodsIssue.reference_number,
      status: 'issued',
      notes: goodsIssue.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lines: (goodsIssue.lines || []).map((line, index) => ({
        id: 'line-' + index + '-' + Date.now(),
        goods_issue_id: 'issue-' + Date.now(),
        raw_material_id: line.raw_material_id,
        quantity_issued: line.quantity_issued,
        unit_cost: costByMaterial.get(String(line.raw_material_id)) ?? line.unit_cost ?? 0,
        batch_number: line.batch_number,
        notes: line.notes,
        created_at: new Date().toISOString()
      }))
    };
    return mockIssue;
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

    // For each line, pre-validate, then record FIFO outflows and set cost
    for (const line of issue.lines || []) {
      await this.validateInventoryAvailability(line.raw_material_id, line.quantity_issued);
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
        await this.consumeInventoryLayers(Number(line.raw_material_id), Number(line.quantity_issued));
      }
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
      .select('quantity_on_hand, quantity_reserved, quantity_available, transaction_type')
      .eq('raw_material_id', id)
      .or('transaction_type.is.null,transaction_type.eq.grn');

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

    // Get current inventory levels (aggregate GRN rows per material)
    const { data: inventoryData, error: inventoryError } = await supabase
      .from('raw_material_inventory')
      .select('raw_material_id, quantity_available, quantity_on_hand, transaction_type')
      .or('transaction_type.is.null,transaction_type.eq.grn');
    if (inventoryError) {
      throw new Error(`Failed to fetch inventory: ${inventoryError.message}`);
    }
    const inventoryMap = new Map<number, number>();
    for (const inv of inventoryData || []) {
      const id = Number((inv as any).raw_material_id);
      const qty = Number((inv as any).quantity_available ?? (inv as any).quantity_on_hand ?? 0);
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
