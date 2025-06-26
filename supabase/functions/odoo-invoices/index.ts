
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
  product_id: [number, string] | false;
  quantity: number;
  price_unit: number;
  price_subtotal: number;
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

    console.log('Starting invoice sync from Odoo to Supabase...');

    // Authenticate with Odoo
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
    console.log('Odoo authentication successful');
    const uid = authData.result;

    if (!uid) {
      throw new Error('Authentication failed');
    }

    // Fetch invoices with smaller batches to avoid timeout
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
              limit: 200, // Reduced batch size
              order: 'invoice_date desc'
            }
          ]
        },
        id: Math.floor(Math.random() * 1000000)
      }),
    });

    const invoicesData = await invoicesResponse.json();
    console.log(`Invoices fetched: ${invoicesData.result?.length || 0}`);

    if (invoicesData.error) {
      throw new Error(`Odoo API error: ${invoicesData.error.message}`);
    }

    const invoices = invoicesData.result || [];

    // Get all invoice line IDs
    const allLineIds = invoices.flatMap((inv: Invoice) => inv.invoice_line_ids || []);
    
    let invoiceLines: InvoiceLine[] = [];
    
    if (allLineIds.length > 0) {
      console.log(`Fetching ${allLineIds.length} invoice lines...`);
      
      // Fetch invoice lines in smaller batches
      const batchSize = 200;
      for (let i = 0; i < allLineIds.length; i += batchSize) {
        const batchLineIds = allLineIds.slice(i, i + batchSize);
        
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
                  fields: ['id', 'product_id', 'quantity', 'price_unit', 'price_subtotal']
                }
              ]
            },
            id: Math.floor(Math.random() * 1000000)
          }),
        });

        const linesData = await linesResponse.json();
        if (!linesData.error && linesData.result) {
          invoiceLines = invoiceLines.concat(linesData.result);
          console.log(`Batch ${Math.floor(i/batchSize) + 1} lines fetched: ${linesData.result.length}`);
        }
      }
    }

    console.log(`Total invoice lines fetched: ${invoiceLines.length}`);

    // Transform data for Supabase
    const transformedInvoices = invoices.map((invoice: Invoice) => {
      const lines = invoiceLines.filter((line: InvoiceLine) => 
        invoice.invoice_line_ids && invoice.invoice_line_ids.includes(line.id)
      );
      
      const orderLines = lines
        .filter((line: InvoiceLine) => line.product_id && Array.isArray(line.product_id) && line.product_id[1])
        .map((line: InvoiceLine) => ({
          product_name: Array.isArray(line.product_id) ? line.product_id[1] : 'Unknown Product',
          qty_delivered: line.quantity || 0,
          price_unit: line.price_unit || 0,
          price_subtotal: line.price_subtotal || 0,
          product_category: getProductCategory(Array.isArray(line.product_id) ? line.product_id[1] : '')
        }));

      return {
        id: invoice.name || invoice.id.toString(),
        name: invoice.name,
        partner_name: Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : 'Unknown Customer',
        date_order: invoice.invoice_date || new Date().toISOString().split('T')[0],
        amount_total: invoice.amount_total || 0,
        state: 'sale',
        order_lines: orderLines
      };
    });

    console.log(`Transformed invoices: ${transformedInvoices.length}`);

    // Clear existing data and insert new data
    console.log('Clearing existing invoice data...');
    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .neq('id', 'dummy'); // Delete all records

    if (deleteError) {
      console.error('Error clearing existing data:', deleteError);
    }

    // Insert in smaller batches
    console.log('Inserting new invoice data...');
    const insertBatchSize = 50;
    let successCount = 0;
    
    for (let i = 0; i < transformedInvoices.length; i += insertBatchSize) {
      const batch = transformedInvoices.slice(i, i + insertBatchSize);
      
      const { data, error } = await supabase
        .from('invoices')
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch ${Math.floor(i/insertBatchSize) + 1}:`, error);
      } else {
        successCount += batch.length;
        console.log(`Batch ${Math.floor(i/insertBatchSize) + 1} inserted successfully`);
      }
    }

    console.log(`Sync completed. ${successCount} invoices synced to Supabase.`);

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

// Helper function to determine product category
function getProductCategory(productName: string): string {
  if (!productName) return 'OTHER';
  
  const name = productName.toUpperCase();
  
  if (name.includes('SOLACE')) return 'SOLACE';
  if (name.includes('DELI')) return 'DELI';
  if (name.includes('FEER')) return 'FEER';
  if (name.includes('BOXER')) return 'BOXER';
  
  return 'OTHER';
}
