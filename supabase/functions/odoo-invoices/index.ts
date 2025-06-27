
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

    console.log('Starting optimized invoice sync from Odoo...');

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

    // Get existing invoice names from Supabase to avoid duplicates
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('name');
    
    const existingInvoiceNames = new Set(
      existingInvoices?.map(inv => inv.name) || []
    );

    console.log(`Found ${existingInvoiceNames.size} existing invoices in Supabase`);

    // Process invoices in smaller date ranges to avoid timeouts
    const currentDate = new Date();
    const startDate = new Date('2024-01-01'); // Start from beginning of 2024
    const dateRanges = [];
    
    // Create monthly ranges to process data in smaller chunks
    let rangeStart = new Date(startDate);
    while (rangeStart < currentDate) {
      const rangeEnd = new Date(rangeStart);
      rangeEnd.setMonth(rangeEnd.getMonth() + 1);
      if (rangeEnd > currentDate) rangeEnd.setTime(currentDate.getTime());
      
      dateRanges.push({
        start: rangeStart.toISOString().split('T')[0],
        end: rangeEnd.toISOString().split('T')[0]
      });
      
      rangeStart = new Date(rangeEnd);
      rangeStart.setDate(rangeStart.getDate() + 1);
    }

    console.log(`Processing ${dateRanges.length} date ranges`);

    let totalNewInvoices = 0;
    let totalSyncedInvoices = 0;

    // Process each date range
    for (let i = 0; i < dateRanges.length; i++) {
      const range = dateRanges[i];
      console.log(`Processing range ${i + 1}/${dateRanges.length}: ${range.start} to ${range.end}`);

      try {
        // Fetch invoices for this date range - exclude cancelled invoices
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
                    ['state', '=', 'posted'], // Only posted invoices
                    ['invoice_date', '>=', range.start],
                    ['invoice_date', '<=', range.end]
                  ]
                ],
                {
                  fields: ['name', 'partner_id', 'invoice_date', 'amount_total', 'state', 'invoice_line_ids'],
                  limit: 100, // Small batch size
                  order: 'invoice_date desc'
                }
              ]
            },
            id: Math.floor(Math.random() * 1000000)
          }),
        });

        const invoicesData = await invoicesResponse.json();
        
        if (invoicesData.error) {
          console.error(`Odoo API error for range ${range.start}-${range.end}:`, invoicesData.error.message);
          continue;
        }

        const rangeInvoices = invoicesData.result || [];
        console.log(`Fetched ${rangeInvoices.length} invoices for range ${range.start}-${range.end}`);

        if (rangeInvoices.length === 0) continue;

        // Filter out existing invoices
        const newInvoices = rangeInvoices.filter((invoice: Invoice) => 
          !existingInvoiceNames.has(invoice.name)
        );

        console.log(`${newInvoices.length} new invoices to process in this range`);

        if (newInvoices.length === 0) continue;

        // Collect all invoice line IDs for this range
        const allLineIds: number[] = [];
        newInvoices.forEach((invoice: Invoice) => {
          if (invoice.invoice_line_ids && Array.isArray(invoice.invoice_line_ids)) {
            allLineIds.push(...invoice.invoice_line_ids);
          }
        });

        console.log(`Fetching ${allLineIds.length} invoice lines for range ${range.start}-${range.end}`);

        // Fetch invoice lines in smaller batches
        const invoiceLines: { [key: number]: InvoiceLine } = {};
        const lineBatchSize = 100; // Even smaller batch size for lines
        
        for (let j = 0; j < allLineIds.length; j += lineBatchSize) {
          const batch = allLineIds.slice(j, j + lineBatchSize);
          
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
            }
          } catch (error) {
            console.error(`Error fetching line batch:`, error);
          }
        }

        console.log(`Fetched ${Object.keys(invoiceLines).length} invoice lines for range`);

        // Transform invoices with complete order lines
        const transformedInvoices = newInvoices.map((invoice: Invoice) => {
          const orderLines = (invoice.invoice_line_ids || [])
            .map(lineId => invoiceLines[lineId])
            .filter(line => line && line.product_id)
            .map(line => ({
              product_name: Array.isArray(line.product_id) ? line.product_id[1] : 'Unknown Product',
              qty_delivered: line.quantity || 0,
              price_unit: line.price_unit || 0,
              // Use price_unit * quantity instead of price_subtotal to avoid discount issues
              price_subtotal: (line.price_unit || 0) * (line.quantity || 0),
              product_category: getProductCategory(Array.isArray(line.product_id) ? line.product_id[1] : '')
            }));

          return {
            id: invoice.name || invoice.id.toString(),
            name: invoice.name,
            partner_name: Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : 'Unknown Customer',
            date_order: invoice.invoice_date || new Date().toISOString().split('T')[0],
            // Recalculate amount_total from order lines to ensure consistency
            amount_total: orderLines.reduce((sum, line) => sum + line.price_subtotal, 0) || invoice.amount_total || 0,
            state: 'sale',
            order_lines: orderLines
          };
        });

        console.log(`Transformed ${transformedInvoices.length} invoices for range`);

        // Insert invoices in very small batches to avoid timeouts
        const insertBatchSize = 15; // Very small batch size
        let rangeSuccessCount = 0;
        
        for (let k = 0; k < transformedInvoices.length; k += insertBatchSize) {
          const batch = transformedInvoices.slice(k, k + insertBatchSize);
          
          try {
            const { error } = await supabase
              .from('invoices')
              .insert(batch);

            if (error) {
              console.error(`Error inserting batch in range ${range.start}-${range.end}:`, error);
            } else {
              rangeSuccessCount += batch.length;
              console.log(`Inserted batch of ${batch.length} invoices for range ${range.start}-${range.end}`);
              
              // Add small delay between batches to prevent overwhelming the system
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (error) {
            console.error(`Batch insert error for range ${range.start}-${range.end}:`, error);
          }
        }

        totalNewInvoices += transformedInvoices.length;
        totalSyncedInvoices += rangeSuccessCount;
        
        // Add to existing invoice names to prevent duplicates in subsequent ranges
        transformedInvoices.forEach(invoice => {
          existingInvoiceNames.add(invoice.name);
        });

        console.log(`Range ${range.start}-${range.end} completed: ${rangeSuccessCount}/${transformedInvoices.length} invoices synced`);

        // Add delay between date ranges to prevent CPU exhaustion
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`Error processing range ${range.start}-${range.end}:`, error);
        continue; // Continue with next range even if this one fails
      }
    }

    console.log(`Sync completed. ${totalSyncedInvoices}/${totalNewInvoices} new invoices synced to Supabase.`);

    return new Response(JSON.stringify({ 
      success: true, 
      totalNewInvoices,
      syncedToSupabase: totalSyncedInvoices,
      processedRanges: dateRanges.length,
      message: `Successfully processed ${dateRanges.length} date ranges and synced ${totalSyncedInvoices} new invoices with complete order lines`
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
