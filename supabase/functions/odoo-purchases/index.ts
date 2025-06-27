import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Purchase {
  id: number;
  name: string;
  partner_id: [number, string];
  date_order: string;
  amount_total: number;
  state: string;
  order_line?: number[];
}

interface PurchaseLine {
  id: number;
  product_id: [number, string] | false;
  product_qty: number;
  qty_received: number;
  price_unit: number;
  price_subtotal: number;
  name: string;
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

    console.log('Fetching all purchase data from Odoo with pagination...');

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

    // Configurable batch size, delay, and offset limit
    const batchSize = parseInt(Deno.env.get('ODOO_PURCHASE_BATCH_SIZE') || '100', 10);
    const upsertBatchSize = parseInt(Deno.env.get('ODOO_PURCHASE_UPSERT_BATCH_SIZE') || '50', 10);
    const lineBatchSize = parseInt(Deno.env.get('ODOO_PURCHASE_LINE_BATCH_SIZE') || '200', 10);
    const delayMs = parseInt(Deno.env.get('ODOO_PURCHASE_DELAY_MS') || '100', 10);
    const lineDelayMs = parseInt(Deno.env.get('ODOO_PURCHASE_LINE_DELAY_MS') || '50', 10);
    const upsertDelayMs = parseInt(Deno.env.get('ODOO_PURCHASE_UPSERT_DELAY_MS') || '100', 10);
    const offsetLimit = parseInt(Deno.env.get('ODOO_PURCHASE_OFFSET_LIMIT') || '100000', 10); // increased default

    let allPurchases: Purchase[] = [];
    let offset = 0;
    const limit = batchSize; // Use configurable batch size
    let hasMore = true;
    let totalFetched = 0;
    let fetchError = false;

    while (hasMore) {
      console.log(`[Odoo Sync] Fetching purchases batch: offset ${offset}, limit ${limit}`);
      try {
      const purchaseResponse = await fetch(`${odooUrl}/jsonrpc`, {
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
              'purchase.order',
              'search_read',
              [
                [['state', 'in', ['purchase', 'done']]]
              ],
              {
                fields: ['name', 'partner_id', 'date_order', 'amount_total', 'state', 'order_line'],
                order: 'date_order desc',
                limit: limit,
                offset: offset
              }
            ]
          },
          id: Math.floor(Math.random() * 1000000)
        }),
      });

      const purchaseData = await purchaseResponse.json();
      if (purchaseData.error) {
          console.error(`[Odoo Sync] Failed to fetch purchase data: ${purchaseData.error.message}`);
          fetchError = true;
          break;
      }
      const batchPurchases = purchaseData.result || [];
        totalFetched += batchPurchases.length;
        console.log(`[Odoo Sync] Fetched ${batchPurchases.length} purchases in this batch (total so far: ${totalFetched})`);
      if (batchPurchases.length === 0) {
        hasMore = false;
      } else {
        allPurchases = allPurchases.concat(batchPurchases);
        offset += limit;
          await new Promise(resolve => setTimeout(resolve, delayMs));
      }
        if (offset > offsetLimit) {
          console.warn(`[Odoo Sync] Reached maximum offset limit (${offsetLimit}), stopping fetch`);
          break;
        }
      } catch (err) {
        console.error(`[Odoo Sync] Exception during fetch:`, err);
        fetchError = true;
        break;
      }
    }
    if (fetchError) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Error occurred during Odoo purchase fetch. See logs for details.',
        count: allPurchases.length
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`[Odoo Sync] Total purchases fetched: ${allPurchases.length}`);

    // Fetch purchase lines for all purchases (in batches)
    const purchaseIds = allPurchases.flatMap(p => p.order_line || []);
    console.log(`Fetching purchase lines for ${purchaseIds.length} line items`);

    let allPurchaseLines: PurchaseLine[] = [];
    
    // Process purchase lines in batches to avoid CPU limits
    for (let i = 0; i < purchaseIds.length; i += lineBatchSize) {
      const batchIds = purchaseIds.slice(i, i + lineBatchSize);
      if (batchIds.length > 0) {
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
                'purchase.order.line',
                'read',
                [batchIds],
                {
                  fields: ['id', 'product_id', 'product_qty', 'qty_received', 'price_unit', 'price_subtotal', 'name', 'order_id']
                }
              ]
            },
            id: Math.floor(Math.random() * 1000000)
          }),
        });
        const linesData = await linesResponse.json();
        if (!linesData.error && linesData.result) {
          allPurchaseLines = allPurchaseLines.concat(linesData.result);
          } else if (linesData.error) {
            console.error(`[Odoo Sync] Error fetching purchase lines batch at index ${i}: ${linesData.error.message}`);
          }
        } catch (err) {
          console.error(`[Odoo Sync] Exception during purchase line fetch at index ${i}:`, err);
        }
        await new Promise(resolve => setTimeout(resolve, lineDelayMs));
      }
    }
    console.log(`[Odoo Sync] Fetched ${allPurchaseLines.length} purchase lines`);

    // Transform and sync purchase data with lines
    const transformedPurchases = allPurchases.map((purchase: Purchase) => {
      const purchaseLines = allPurchaseLines.filter(line => 
        purchase.order_line && purchase.order_line.includes(line.id)
      );

      const receivedQty = purchaseLines.reduce((sum, line) => sum + (line.qty_received || 0), 0);
      const pendingQty = purchaseLines.reduce((sum, line) => 
        sum + Math.max(0, (line.product_qty || 0) - (line.qty_received || 0)), 0
      );

      return {
        id: purchase.name || purchase.id.toString(),
        name: purchase.name,
        partner_name: Array.isArray(purchase.partner_id) ? purchase.partner_id[1] : 'Unknown Supplier',
        date_order: purchase.date_order ? purchase.date_order.split(' ')[0] : null,
        amount_total: purchase.amount_total || 0,
        state: purchase.state || 'draft',
        received_qty: receivedQty,
        pending_qty: pendingQty,
        expected_date: null,
        order_lines: purchaseLines.map(line => ({
          id: line.id,
          product_name: Array.isArray(line.product_id) ? line.product_id[1] : line.name || 'Unknown Product',
          product_qty: line.product_qty || 0,
          qty_received: line.qty_received || 0,
          price_unit: line.price_unit || 0,
          price_subtotal: line.price_subtotal || 0
        }))
      };
    });

    // Upsert purchases to Supabase in batches
    console.log('[Odoo Sync] Syncing purchases to Supabase...');
    let upsertErrors = 0;
    for (let i = 0; i < transformedPurchases.length; i += upsertBatchSize) {
      const batch = transformedPurchases.slice(i, i + upsertBatchSize);
      try {
      const { error: purchaseError } = await supabase
        .from('purchases')
        .upsert(batch.map(p => ({
          id: p.id,
          name: p.name,
          partner_name: p.partner_name,
          date_order: p.date_order,
          amount_total: p.amount_total,
          state: p.state,
          received_qty: p.received_qty,
          pending_qty: p.pending_qty,
          expected_date: p.expected_date,
          order_lines: p.order_lines
        })), { onConflict: 'id' });
      if (purchaseError) {
          upsertErrors++;
          console.error(`[Odoo Sync] Failed to sync purchase batch ${i}: ${purchaseError.message}`);
        } else {
          console.log(`[Odoo Sync] Synced purchase batch ${i} (${batch.length} records)`);
        }
      } catch (err) {
        upsertErrors++;
        console.error(`[Odoo Sync] Exception during purchase upsert batch ${i}:`, err);
      }
      await new Promise(resolve => setTimeout(resolve, upsertDelayMs));
    }
    if (upsertErrors > 0) {
      console.warn(`[Odoo Sync] Encountered ${upsertErrors} errors during purchase upsert batches.`);
    }

    // Also sync purchase lines to the purchase_lines table
    console.log('[Odoo Sync] Syncing purchase lines...');
    const allLinesForSync = transformedPurchases.flatMap(purchase => 
      purchase.order_lines.map(line => ({
        id: line.id.toString(),
        purchase_id: purchase.id,
        product_name: line.product_name,
        qty_ordered: line.product_qty,
        qty_received: line.qty_received,
        price_unit: line.price_unit
      }))
    );
    let lineUpsertErrors = 0;
    for (let i = 0; i < allLinesForSync.length; i += 100) {
      const batch = allLinesForSync.slice(i, i + 100);
      try {
      const { error: linesError } = await supabase
        .from('purchase_lines')
        .upsert(batch, { onConflict: 'id' });
      if (linesError) {
          lineUpsertErrors++;
          console.error(`[Odoo Sync] Failed to sync purchase lines batch ${i}: ${linesError.message}`);
        } else {
          console.log(`[Odoo Sync] Synced purchase lines batch ${i} (${batch.length} records)`);
        }
      } catch (err) {
        lineUpsertErrors++;
        console.error(`[Odoo Sync] Exception during purchase lines upsert batch ${i}:`, err);
      }
      await new Promise(resolve => setTimeout(resolve, lineDelayMs));
    }
    if (lineUpsertErrors > 0) {
      console.warn(`[Odoo Sync] Encountered ${lineUpsertErrors} errors during purchase lines upsert batches.`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data: transformedPurchases,
      count: transformedPurchases.length,
      message: `Successfully synced ${transformedPurchases.length} purchase orders with ${allPurchaseLines.length} line items`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in odoo-purchases function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
