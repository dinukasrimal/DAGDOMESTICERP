import { supabase } from '@/integrations/supabase/client';

export interface CuttingSupplier {
  id: number;
  name: string;
}

class CuttingSupplierService {
  async list(): Promise<CuttingSupplier[]> {
    const { data, error } = await supabase
      .from('cutting_suppliers')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to load cutting suppliers: ${error.message}`);
    }

    return (data || []).map(row => ({
      id: row.id,
      name: row.name?.trim() || '',
    }));
  }

  async create(name: string): Promise<CuttingSupplier> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Supplier name cannot be empty.');
    }

    const { data, error } = await supabase
      .from('cutting_suppliers')
      .insert({ name: trimmed })
      .select('id, name')
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to add supplier.');
    }

    return { id: data.id, name: data.name?.trim() || trimmed };
  }
}

export const cuttingSupplierService = new CuttingSupplierService();
