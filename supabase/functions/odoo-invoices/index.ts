
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Invoice {
  id: number;
  name: string;
  partner_id: [number, string];
  invoice_date: string;
  amount_total: number;
  state: string;
  invoice_line_ids: number[];
}

interface InvoiceLine {
  id: number;
  product_id: [number, string];
  quantity: number;
  price_unit: number;
  price_subtotal: number;
  move_id: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const odooUrl = Deno.env.get('ODOO_URL');
    const odooDatabase = Deno.env.get('ODOO_DATABASE');
    const odooUsername = Deno.env.get('ODOO_USERNAME');
    const odooPassword = Deno.env.get('ODOO_PASSWORD');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!odooUrl || !odooDatabase || !odooUsername || !odooPassword) {
      throw new Error('Missing Odoo configuration');
    }

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Syncing invoice data from Odoo to Supabase...');

    // First authenticate with Odoo
    const authResponse = await fetch(`${odooUrl}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'common',
          method: 'authenticate',
          args: [odooDatabase, odooUsername, odooPassword, {}]
        },
        id: Math.floor(Math.random() * 1000000)
      }),
    });

    const authData = await authResponse.json();
    console.log('Odoo authentication result:', authData);
    const uid = authData.result;

    if (!uid) {
      throw new Error('Authentication failed');
    }

    // Fetch all customer invoices in batches
    let offset = 0;
    const limit = 100;
    let allInvoices: Invoice[] = [];
    let hasMore = true;

    while (hasMore) {
      console.log(`Fetching invoices batch, offset: ${offset}`);
      
      const invoicesResponse = await fetch(`${odooUrl}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            service: 'object',
            method: 'execute_kw',
            args: [
              odooDatabase,
              uid,
              odooPassword,
              'account.move',
              'search_read',
              [
                [
                  ['move_type', '=', 'out_invoice'],
                  ['state', '=', 'posted']
                ]
              ],
              {
                fields: ['name', 'partner_id', 'invoice_date', 'amount_total', 'state', 'invoice_line_ids'],
                limit: limit,
                offset: offset,
                order: 'invoice_date desc'
              }
            ]
          },
          id: Math.floor(Math.random() * 1000000)
        }),
      });

      const invoicesData = await invoicesResponse.json();
      console.log(`Batch ${Math.floor(offset/limit) + 1} - invoices fetched:`, invoicesData.result?.length || 0);

      if (invoicesData.error) {
        throw new Error(`Odoo API error: ${invoicesData.error.message}`);
      }

      const batchInvoices = invoicesData.result || [];
      if (batchInvoices.length === 0) {
        hasMore = false;
      } else {
        allInvoices = allInvoices.concat(batchInvoices);
        offset += limit;
        
        // Stop if we got less than the limit (last batch)
        if (batchInvoices.length < limit) {
          hasMore = false;
        }
      }
    }

    console.log(`Total invoices fetched: ${allInvoices.length}`);

    // Get all invoice line IDs
    const allLineIds = allInvoices.flatMap((inv: Invoice) => inv.invoice_line_ids || []);
    
    let invoiceLines: InvoiceLine[] = [];
    
    if (allLineIds.length > 0) {
      console.log(`Fetching ${allLineIds.length} invoice lines...`);
      
      // Fetch invoice lines in batches
      const linesBatchSize = 500;
      for (let i = 0; i < allLineIds.length; i += linesBatchSize) {
        const batchLineIds = allLineIds.slice(i, i + linesBatchSize);
        
        const linesResponse = await fetch(`${odooUrl}/jsonrpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            params: {
              service: 'object',
              method: 'execute_kw',
              args: [
                odooDatabase,
                uid,
                odooPassword,
                'account.move.line',
                'search_read',
                [
                  [['id', 'in', batchLineIds]]
                ],
                {
                  fields: ['id', 'product_id', 'quantity', 'price_unit', 'price_subtotal', 'move_id']
                }
              ]
            },
            id: Math.floor(Math.random() * 1000000)
          }),
        });

        const linesData = await linesResponse.json();
        if (!linesData.error && linesData.result) {
          invoiceLines = invoiceLines.concat(linesData.result);
        }
      }
    }

    console.log(`Invoice lines fetched: ${invoiceLines.length}`);

    // Transform invoices for Supabase
    const transformedInvoices = allInvoices.map((invoice: Invoice) => {
      const lines = invoiceLines.filter((line: InvoiceLine) => 
        invoice.invoice_line_ids && invoice.invoice_line_ids.includes(line.id)
      );
      
      const orderLines = lines
        .filter((line: InvoiceLine) => line.product_id && line.product_id[1])
        .map((line: InvoiceLine) => ({
          product_name: line.product_id[1],
          qty_delivered: line.quantity || 0,
          price_unit: line.price_unit || 0,
          price_subtotal: line.price_subtotal || 0,
          product_category: getProductCategory(line.product_id[1])
        }));

      return {
        id: invoice.name || invoice.id.toString(),
        name: invoice.name,
        partner_name: Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : 'Unknown Customer',
        date_order: invoice.invoice_date ? invoice.invoice_date : new Date().toISOString().split('T')[0],
        amount_total: invoice.amount_total || 0,
        state: 'sale', // Invoices are considered as completed sales
        order_lines: orderLines
      };
    });

    console.log(`Transformed invoices ready for sync: ${transformedInvoices.length}`);

    // Sync to Supabase - use upsert to handle duplicates
    console.log('Syncing invoices to Supabase...');
    
    // Insert in batches to avoid conflicts
    const batchSize = 50;
    let successCount = 0;
    
    for (let i = 0; i < transformedInvoices.length; i += batchSize) {
      const batch = transformedInvoices.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('invoices')
        .upsert(batch, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error(`Error syncing batch ${Math.floor(i/batchSize) + 1}:`, error);
        // Continue with next batch instead of failing completely
      } else {
        successCount += batch.length;
        console.log(`Batch ${Math.floor(i/batchSize) + 1} synced successfully`);
      }
    }

    console.log(`Sync completed. ${successCount} invoices synced to Supabase.`);

    // Return the transformed data for immediate use
    return new Response(JSON.stringify({ 
      success: true, 
      data: transformedInvoices,
      count: transformedInvoices.length,
      synced_to_supabase: successCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in odoo-invoices function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to determine product category based on product name
function getProductCategory(productName: string): string {
  if (!productName) return 'OTHER';
  
  const name = productName.toUpperCase();
  
  if (name.includes('SOLACE')) return 'SOLACE';
  if (name.includes('DELI')) return 'DELI';
  if (name.includes('FEER')) return 'FEER';
  if (name.includes('BOXER')) return 'BOXER';
  
  return 'OTHER';
}
