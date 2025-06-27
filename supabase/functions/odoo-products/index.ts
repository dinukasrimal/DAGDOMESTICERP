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

    // Fetch products with batching
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
                fields: ['id', 'name', 'default_code', 'categ_id', 'type', 'uom_id', 'active'],
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
    // Map products for upsert
    const upsertProducts = allProducts.map((p: any) => ({
      id: p.id,
      name: p.name,
      default_code: p.default_code || null,
      product_category: Array.isArray(p.categ_id) ? p.categ_id[1] : null,
      category_id: Array.isArray(p.categ_id) ? p.categ_id[0] : null,
      type: p.type || null,
      uom: Array.isArray(p.uom_id) ? p.uom_id[1] : null,
      active: typeof p.active === 'boolean' ? p.active : true,
      updated_at: new Date().toISOString()
    }));
    // Upsert in batches
    for (let i = 0; i < upsertProducts.length; i += 100) {
      const batch = upsertProducts.slice(i, i + 100);
      const { error } = await supabase.from('products').upsert(batch, { onConflict: 'id' });
      if (error) {
        console.error('Upsert error:', error.message);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return new Response(JSON.stringify({
      success: true,
      count: upsertProducts.length,
      message: `Successfully synced ${upsertProducts.length} products from Odoo.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in odoo-products function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}); 