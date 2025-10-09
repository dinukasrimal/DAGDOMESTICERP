import { supabase } from '@/integrations/supabase/client';

export type CustomerMergeType = 'customer' | 'invoice';

export interface CustomerMergeGroupRecord {
  id: string;
  primary_customer: string;
  merge_type: CustomerMergeType;
  is_active: boolean;
  customer_merge_members?: Array<{ merged_customer: string }>;
  customer_invoice_merges?: Array<{
    id: string;
    invoice_id: string;
    primary_customer: string;
    merged_from_customer: string | null;
  }>;
}

export interface CustomerMergeData {
  groups: CustomerMergeGroupRecord[];
}

export const fetchCustomerMergeData = async (): Promise<CustomerMergeData> => {
  const { data, error } = await supabase
    .from('customer_merge_groups')
    .select(`
      id,
      primary_customer,
      merge_type,
      is_active,
      customer_merge_members(merged_customer),
      customer_invoice_merges(id, invoice_id, primary_customer, merged_from_customer)
    `);

  if (error) {
    throw error;
  }

  return {
    groups: data || [],
  };
};

export const ensureMergeGroup = async (
  primaryCustomer: string,
  mergeType: CustomerMergeType
): Promise<string> => {
  const { data, error } = await supabase
    .from('customer_merge_groups')
    .select('id')
    .eq('primary_customer', primaryCustomer)
    .eq('merge_type', mergeType)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (data?.id) {
    return data.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('customer_merge_groups')
    .insert({
      primary_customer: primaryCustomer,
      merge_type: mergeType,
      is_active: true,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw insertError || new Error('Failed to create merge group');
  }

  return inserted.id;
};

export const addCustomerMergeMembers = async (
  mergeGroupId: string,
  members: string[]
) => {
  if (members.length === 0) return;
  const payload = members.map(mergedCustomer => ({
    merge_group_id: mergeGroupId,
    merged_customer: mergedCustomer,
  }));

  const { error } = await supabase
    .from('customer_merge_members')
    .upsert(payload, { onConflict: 'merge_group_id,merged_customer' });

  if (error) {
    throw error;
  }
};

export interface InvoiceMergePayload {
  invoice_id: string;
  primary_customer: string;
  merged_from_customer?: string | null;
}

export const upsertInvoiceMerges = async (
  mergeGroupId: string,
  payload: InvoiceMergePayload[]
) => {
  if (payload.length === 0) return;

  const { error } = await supabase
    .from('customer_invoice_merges')
    .upsert(
      payload.map(entry => ({
        merge_group_id: mergeGroupId,
        invoice_id: entry.invoice_id,
        primary_customer: entry.primary_customer,
        merged_from_customer: entry.merged_from_customer ?? null,
      })),
      { onConflict: 'invoice_id' }
    );

  if (error) {
    throw error;
  }
};

export const deleteInvoiceMerge = async (invoiceId: string) => {
  const { error } = await supabase
    .from('customer_invoice_merges')
    .delete()
    .eq('invoice_id', invoiceId);

  if (error) {
    throw error;
  }
};

export const deactivateMergeGroup = async (groupId: string) => {
  const { error } = await supabase
    .from('customer_merge_groups')
    .delete()
    .eq('id', groupId);

  if (error) {
    throw error;
  }
};
