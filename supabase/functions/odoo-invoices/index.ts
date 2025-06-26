
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

    console.log('Starting invoice sync from Odoo...');

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

    // Fetch only recent invoices to avoid timeout (last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const dateFilter = threeMonthsAgo.toISOString().split('T')[0];

    console.log(`Fetching invoices from ${dateFilter}...`);

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
                ['state', '=', 'posted'],
                ['invoice_date', '>=', dateFilter]
              ]
            ],
            {
              fields: ['name', 'partner_id', 'invoice_date', 'amount_total', 'state', 'invoice_line_ids'],
              limit: 100, // Much smaller limit
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

    const invoices = invoicesData.result || [];
    console.log(`Fetched ${invoices.length} recent invoices`);

    if (invoices.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No recent invoices found',
        count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Transform invoices without detailed line items for now (to avoid timeout)
    const transformedInvoices = invoices.map((invoice: Invoice) => ({
      id: invoice.name || invoice.id.toString(),
      name: invoice.name,
      partner_name: Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : 'Unknown Customer',
      date_order: invoice.invoice_date || new Date().toISOString().split('T')[0],
      amount_total: invoice.amount_total || 0,
      state: 'sale',
      order_lines: [] // Will be populated in background
    }));

    console.log(`Transformed ${transformedInvoices.length} invoices`);

    // Clear only recent data and insert new data
    console.log('Clearing recent invoice data...');
    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .gte('date_order', dateFilter);

    if (deleteError) {
      console.error('Error clearing recent data:', deleteError);
    }

    // Insert in smaller batches
    console.log('Inserting new invoice data...');
    const batchSize = 20; // Very small batches
    let successCount = 0;
    
    for (let i = 0; i < transformedInvoices.length; i += batchSize) {
      const batch = transformedInvoices.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('invoices')
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch ${Math.floor(i/batchSize) + 1}:`, error);
      } else {
        successCount += batch.length;
        console.log(`Batch ${Math.floor(i/batchSize) + 1} inserted: ${batch.length} records`);
      }
    }

    console.log(`Sync completed. ${successCount} invoices synced to Supabase.`);

    return new Response(JSON.stringify({ 
      success: true, 
      data: transformedInvoices,
      count: transformedInvoices.length,
      synced_to_supabase: successCount,
      message: `Successfully synced ${successCount} recent invoices (last 3 months)`
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
