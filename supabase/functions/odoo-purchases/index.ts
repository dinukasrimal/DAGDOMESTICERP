
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

    // Fetch purchase orders with pagination to avoid CPU limits
    let allPurchases: Purchase[] = [];
    let offset = 0;
    const limit = 100; // Process in batches of 100
    let hasMore = true;

    while (hasMore) {
      console.log(`Fetching purchases batch: offset ${offset}, limit ${limit}`);
      
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
        throw new Error(`Failed to fetch purchase data: ${purchaseData.error.message}`);
      }

      const batchPurchases = purchaseData.result || [];
      console.log(`Fetched ${batchPurchases.length} purchases in this batch`);
      
      if (batchPurchases.length === 0) {
        hasMore = false;
      } else {
        allPurchases = allPurchases.concat(batchPurchases);
        offset += limit;
        
        // Add small delay to avoid overwhelming the CPU
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Safety check to prevent infinite loops
      if (offset > 10000) {
        console.log('Reached maximum offset limit, stopping fetch');
        break;
      }
    }

    console.log(`Total purchases fetched: ${allPurchases.length}`);

    // Fetch purchase lines for all purchases (in batches)
    const purchaseIds = allPurchases.flatMap(p => p.order_line || []);
    console.log(`Fetching purchase lines for ${purchaseIds.length} line items`);

    let allPurchaseLines: PurchaseLine[] = [];
    
    // Process purchase lines in batches to avoid CPU limits
    for (let i = 0; i < purchaseIds.length; i += 200) {
      const batchIds = purchaseIds.slice(i, i + 200);
      
      if (batchIds.length > 0) {
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
        }
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    console.log(`Fetched ${allPurchaseLines.length} purchase lines`);

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
    console.log('Syncing purchases to Supabase...');
    
    for (let i = 0; i < transformedPurchases.length; i += 50) {
      const batch = transformedPurchases.slice(i, i + 50);
      
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
        console.error(`Failed to sync batch ${i}: ${purchaseError.message}`);
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Also sync purchase lines to the purchase_lines table
    console.log('Syncing purchase lines...');
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

    for (let i = 0; i < allLinesForSync.length; i += 100) {
      const batch = allLinesForSync.slice(i, i + 100);
      
      const { error: linesError } = await supabase
        .from('purchase_lines')
        .upsert(batch, { onConflict: 'id' });

      if (linesError) {
        console.error(`Failed to sync purchase lines batch ${i}: ${linesError.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
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
