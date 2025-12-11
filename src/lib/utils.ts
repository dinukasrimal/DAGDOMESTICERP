import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase } from '@/integrations/supabase/client';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// List of allowed table names for type safety
export type SupabaseTable =
  | 'invoices'
  | 'purchases'
  | 'inventory'
  | 'products'
  | 'orders'
  | 'profiles'
  | 'purchase_holds'
  | 'purchase_lines'
  | 'ramp_up_plans'
  | 'holidays'
  | 'holiday_production_lines'
  | 'production_lines';

/**
 * Fetch all rows from a Supabase table in batches.
 * @param table Table name
 * @param orderField Field to order by (default: 'date_order')
 * @param batchSize Number of rows per batch (default: 1000)
 */
export async function supabaseBatchFetch(table: SupabaseTable, orderField: string = 'date_order', batchSize: number = 1000) {
  let allRows: any[] = [];
  let from = 0;
  let to = batchSize - 1;
  let keepGoing = true;

  while (keepGoing) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderField, { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (data) allRows = allRows.concat(data);
    if (!data || data.length < batchSize) keepGoing = false;
    from += batchSize;
    to += batchSize;
  }

  return allRows;
}
