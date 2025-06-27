import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    if (!uid) throw new Error('Authentication failed');

    // Fetch inventory (stock quantities) with batching
    let allProducts = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    while (hasMore) {
      const productResponse = await fetch(`${odooUrl}/jsonrpc`, {
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
              [[]],
              {
                fields: [
                  'id', 'name', 'categ_id', 'qty_available'
                ],
                limit,
                offset
              }
            ]
          },
          id: Math.floor(Math.random() * 1000000)
        }),
      });
      const productData = await productResponse.json();
      if (productData.error) throw new Error(productData.error.message);
      const batch = productData.result || [];
      allProducts = allProducts.concat(batch);
      offset += limit;
      hasMore = batch.length === limit;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Fetch purchase holds from Supabase
    const { data: purchaseHolds, error: holdsError } = await supabase.from('purchase_holds').select('purchase_id');
    const heldPurchaseIds = new Set((purchaseHolds || []).map((h: any) => h.purchase_id));

    // Fetch purchase orders and lines from Odoo
    let allPurchaseOrders = [];
    let poOffset = 0;
    const poLimit = 100;
    let poHasMore = true;
    while (poHasMore) {
      const poResponse = await fetch(`${odooUrl}/jsonrpc`, {
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
              [[]],
              {
                fields: ['id', 'name', 'order_line'],
                limit: poLimit,
                offset: poOffset
              }
            ]
          },
          id: Math.floor(Math.random() * 1000000)
        }),
      });
      const poData = await poResponse.json();
      if (poData.error) throw new Error(poData.error.message);
      const batch = poData.result || [];
      allPurchaseOrders = allPurchaseOrders.concat(batch);
      poOffset += poLimit;
      poHasMore = batch.length === poLimit;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Fetch all purchase order lines
    const allPOLineIds = allPurchaseOrders.flatMap((po: any) => po.order_line || []);
    let allPOLines = [];
    for (let i = 0; i < allPOLineIds.length; i += 100) {
      const batchIds = allPOLineIds.slice(i, i + 100);
      if (batchIds.length > 0) {
        const lineResponse = await fetch(`${odooUrl}/jsonrpc`, {
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
                  fields: ['id', 'order_id', 'product_id', 'product_qty', 'qty_received']
                }
              ]
            },
            id: Math.floor(Math.random() * 1000000)
          }),
        });
        const lineData = await lineResponse.json();
        if (lineData.error) throw new Error(lineData.error.message);
        allPOLines = allPOLines.concat(lineData.result || []);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    // Calculate incoming_qty for each product (exclude held POs)
    const incomingQtyMap: Record<string, number> = {};
    allPOLines.forEach((line: any) => {
      const poId = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id;
      if (!heldPurchaseIds.has(poId)) {
        const productId = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
        const pending = Math.max(0, (line.product_qty || 0) - (line.qty_received || 0));
        if (!incomingQtyMap[productId]) incomingQtyMap[productId] = 0;
        incomingQtyMap[productId] += pending;
      }
    });
    // Map products for upsert into inventory (minimal fields for debug)
    const upsertInventory = allProducts.map((p: any) => ({
      id: p.id.toString(),
      product_id: p.id,
      product_name: p.name,
      product_category: Array.isArray(p.categ_id) ? p.categ_id[1] : null,
      quantity_on_hand: p.qty_available || 0,
      incoming_qty: incomingQtyMap[p.id] || 0,
      // The rest are omitted for debug
    }));
    // Upsert in batches
    for (let i = 0; i < upsertInventory.length; i += 100) {
      const batch = upsertInventory.slice(i, i + 100);
      const { error } = await supabase.from('inventory').upsert(batch, { onConflict: 'id' });
      if (error) {
        console.error('Upsert error:', error.message);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return new Response(JSON.stringify({
      success: true,
      count: upsertInventory.length,
      message: `Successfully synced ${upsertInventory.length} inventory records from Odoo.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in odoo-inventory function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}); 