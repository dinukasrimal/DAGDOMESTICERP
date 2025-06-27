
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

interface Product {
  id: number;
  name: string;
  categ_id: [number, string] | false;
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

    // Get existing invoice names from Supabase to avoid duplicates
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('name');
    
    const existingInvoiceNames = new Set(
      existingInvoices?.map(inv => inv.name) || []
    );

    console.log(`Found ${existingInvoiceNames.size} existing invoices in Supabase`);

    // Fetch ALL posted invoices from Odoo (no date restriction for historical data)
    console.log('Fetching all posted invoices from Odoo...');
    const allInvoicesResponse = await fetch(`${odooUrl}/jsonrpc`, {
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
                ['state', '=', 'posted'] // Only posted invoices, excluding cancelled
              ]
            ],
            {
              fields: ['name', 'partner_id', 'invoice_date', 'amount_total', 'state', 'invoice_line_ids'],
              order: 'invoice_date desc'
            }
          ]
        },
        id: Math.floor(Math.random() * 1000000)
      }),
    });

    const allInvoicesData = await allInvoicesResponse.json();
    
    if (allInvoicesData.error) {
      throw new Error(`Failed to fetch invoices: ${allInvoicesData.error.message}`);
    }

    const allInvoices = allInvoicesData.result || [];
    console.log(`Fetched ${allInvoices.length} total posted invoices from Odoo`);

    // Filter out existing invoices
    const newInvoices = allInvoices.filter((invoice: Invoice) => 
      !existingInvoiceNames.has(invoice.name)
    );

    console.log(`${newInvoices.length} new invoices to process`);

    if (newInvoices.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        totalInvoices: allInvoices.length,
        newInvoices: 0,
        message: 'All invoices are already synced'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process invoices in batches to avoid timeout
    const batchSize = 50;
    let totalSynced = 0;
    
    for (let i = 0; i < newInvoices.length; i += batchSize) {
      const batch = newInvoices.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(newInvoices.length/batchSize)}: ${batch.length} invoices`);

      // Collect all invoice line IDs for this batch
      const allLineIds: number[] = [];
      batch.forEach((invoice: Invoice) => {
        if (invoice.invoice_line_ids && Array.isArray(invoice.invoice_line_ids)) {
          allLineIds.push(...invoice.invoice_line_ids);
        }
      });

      console.log(`Fetching ${allLineIds.length} invoice lines for batch`);

      // Fetch invoice lines for this batch
      const invoiceLines: { [key: number]: InvoiceLine } = {};
      if (allLineIds.length > 0) {
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
                  [['id', 'in', allLineIds]]
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
      }

      // Get unique product IDs to fetch product categories
      const productIds = new Set<number>();
      Object.values(invoiceLines).forEach(line => {
        if (line.product_id && Array.isArray(line.product_id)) {
          productIds.add(line.product_id[0]);
        }
      });

      // Fetch product details with categories
      const products: { [key: number]: Product } = {};
      if (productIds.size > 0) {
        const productsResponse = await fetch(`${odooUrl}/jsonrpc`, {
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
                'product.product',
                'search_read',
                [
                  [['id', 'in', Array.from(productIds)]]
                ],
                {
                  fields: ['id', 'name', 'categ_id']
                }
              ]
            },
            id: Math.floor(Math.random() * 1000000)
          }),
        });

        const productsData = await productsResponse.json();
        
        if (productsData.result) {
          productsData.result.forEach((product: Product) => {
            products[product.id] = product;
          });
        }
      }

      console.log(`Fetched ${Object.keys(products).length} product details`);

      // Transform invoices with complete order lines and proper categories
      const transformedInvoices = batch.map((invoice: Invoice) => {
        const orderLines = (invoice.invoice_line_ids || [])
          .map(lineId => invoiceLines[lineId])
          .filter(line => line && line.product_id)
          .map(line => {
            const productId = Array.isArray(line.product_id) ? line.product_id[0] : null;
            const product = productId ? products[productId] : null;
            const categoryName = product?.categ_id && Array.isArray(product.categ_id) 
              ? product.categ_id[1] 
              : 'Uncategorized';

            return {
              product_name: Array.isArray(line.product_id) ? line.product_id[1] : 'Unknown Product',
              qty_delivered: line.quantity || 0,
              price_unit: line.price_unit || 0,
              // Use price_unit * quantity to avoid discount issues
              price_subtotal: (line.price_unit || 0) * (line.quantity || 0),
              product_category: categoryName
            };
          });

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

      console.log(`Transformed ${transformedInvoices.length} invoices for batch`);

      // Insert invoices in small sub-batches to avoid timeouts
      const insertBatchSize = 10;
      let batchSyncedCount = 0;
      
      for (let j = 0; j < transformedInvoices.length; j += insertBatchSize) {
        const subBatch = transformedInvoices.slice(j, j + insertBatchSize);
        
        try {
          const { error } = await supabase
            .from('invoices')
            .insert(subBatch);

          if (error) {
            console.error(`Error inserting sub-batch:`, error);
          } else {
            batchSyncedCount += subBatch.length;
            console.log(`Inserted sub-batch of ${subBatch.length} invoices`);
          }
        } catch (error) {
          console.error(`Sub-batch insert error:`, error);
        }
        
        // Small delay between sub-batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      totalSynced += batchSyncedCount;
      console.log(`Batch completed: ${batchSyncedCount}/${transformedInvoices.length} invoices synced`);
      
      // Add to existing invoice names to prevent duplicates in subsequent batches
      transformedInvoices.forEach(invoice => {
        existingInvoiceNames.add(invoice.name);
      });

      // Delay between batches to prevent CPU exhaustion
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Sync completed. ${totalSynced}/${newInvoices.length} new invoices synced to Supabase.`);

    return new Response(JSON.stringify({ 
      success: true, 
      totalInvoices: allInvoices.length,
      newInvoices: newInvoices.length,
      syncedToSupabase: totalSynced,
      message: `Successfully synced ${totalSynced} new invoices with proper Odoo product categories and order lines`
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
