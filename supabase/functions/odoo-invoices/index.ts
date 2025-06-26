
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

    console.log('Starting comprehensive invoice sync from Odoo...');

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
    const uid = authData.result;

    if (!uid) {
      throw new Error('Authentication failed');
    }

    console.log('Authenticated successfully');

    // Get existing invoice IDs from Supabase to avoid duplicates
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('name');
    
    const existingInvoiceNames = new Set(
      existingInvoices?.map(inv => inv.name) || []
    );

    console.log(`Found ${existingInvoiceNames.size} existing invoices in Supabase`);

    // Fetch ALL invoices from Odoo (no date filter for comprehensive import)
    console.log('Fetching all invoices from Odoo...');

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
              limit: 500, // Process in batches of 500
              order: 'invoice_date desc'
            }
          ]
        },
        id: Math.floor(Math.random() * 1000000)
      }),
    });

    const invoicesData = await invoicesResponse.json();
    
    if (invoicesData.error) {
      throw new Error(`Odoo API error: ${invoicesData.error.message}`);
    }

    const allInvoices = invoicesData.result || [];
    console.log(`Fetched ${allInvoices.length} total invoices from Odoo`);

    // Filter out existing invoices to avoid duplicates
    const newInvoices = allInvoices.filter((invoice: Invoice) => 
      !existingInvoiceNames.has(invoice.name)
    );

    console.log(`${newInvoices.length} new invoices to process`);

    if (newInvoices.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No new invoices to sync',
        totalInvoices: allInvoices.length,
        newInvoices: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect all invoice line IDs
    const allLineIds: number[] = [];
    newInvoices.forEach((invoice: Invoice) => {
      if (invoice.invoice_line_ids && Array.isArray(invoice.invoice_line_ids)) {
        allLineIds.push(...invoice.invoice_line_ids);
      }
    });

    console.log(`Total invoice lines to fetch: ${allLineIds.length}`);

    // Fetch invoice lines in batches
    const invoiceLines: { [key: number]: InvoiceLine } = {};
    const batchSize = 200;
    
    for (let i = 0; i < allLineIds.length; i += batchSize) {
      const batch = allLineIds.slice(i, i + batchSize);
      console.log(`Fetching line batch ${Math.floor(i/batchSize) + 1}: ${batch.length} lines`);
      
      try {
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
                  [['id', 'in', batch]]
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
        
        if (linesData.result) {
          linesData.result.forEach((line: InvoiceLine) => {
            invoiceLines[line.id] = line;
          });
          console.log(`Batch ${Math.floor(i/batchSize) + 1} lines fetched: ${linesData.result.length}`);
        }
      } catch (error) {
        console.error(`Error fetching line batch ${Math.floor(i/batchSize) + 1}:`, error);
      }
    }

    console.log(`Total invoice lines fetched: ${Object.keys(invoiceLines).length}`);

    // Transform invoices with complete order lines
    const transformedInvoices = newInvoices.map((invoice: Invoice) => {
      const orderLines = (invoice.invoice_line_ids || [])
        .map(lineId => invoiceLines[lineId])
        .filter(line => line && line.product_id)
        .map(line => ({
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

    console.log(`Transformed ${transformedInvoices.length} invoices with order lines`);

    // Insert new invoices in small batches
    const insertBatchSize = 25;
    let successCount = 0;
    
    for (let i = 0; i < transformedInvoices.length; i += insertBatchSize) {
      const batch = transformedInvoices.slice(i, i + insertBatchSize);
      
      try {
        const { error } = await supabase
          .from('invoices')
          .insert(batch);

        if (error) {
          console.error(`Error inserting batch ${Math.floor(i/insertBatchSize) + 1}:`, error);
        } else {
          successCount += batch.length;
          console.log(`Batch ${Math.floor(i/insertBatchSize) + 1} inserted: ${batch.length} records`);
        }
      } catch (error) {
        console.error(`Batch insert error ${Math.floor(i/insertBatchSize) + 1}:`, error);
      }
    }

    console.log(`Sync completed. ${successCount} new invoices synced to Supabase.`);

    return new Response(JSON.stringify({ 
      success: true, 
      data: transformedInvoices,
      totalInvoices: allInvoices.length,
      newInvoices: transformedInvoices.length,
      syncedToSupabase: successCount,
      message: `Successfully synced ${successCount} new invoices with order lines`
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
