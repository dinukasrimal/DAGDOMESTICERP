
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

    console.log('Fetching purchase data from Odoo...');

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

    // Fetch purchase orders
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
              limit: 50
            }
          ]
        },
        id: Math.floor(Math.random() * 1000000)
      }),
    });

    const purchaseData = await purchaseResponse.json();
    
    console.log('Purchase data received:', purchaseData);

    if (purchaseData.error) {
      throw new Error(`Failed to fetch purchase data: ${purchaseData.error.message}`);
    }

    const purchases = purchaseData.result || [];

    // Transform and sync purchase data
    const transformedPurchases = purchases.map((purchase: Purchase) => ({
      id: purchase.name || purchase.id.toString(),
      name: purchase.name,
      partner_name: Array.isArray(purchase.partner_id) ? purchase.partner_id[1] : 'Unknown Supplier',
      date_order: purchase.date_order ? purchase.date_order.split(' ')[0] : null,
      amount_total: purchase.amount_total || 0,
      state: purchase.state || 'draft',
      received_qty: 0, // This would need to be calculated from purchase lines
      pending_qty: 0,  // This would need to be calculated from purchase lines
      expected_date: null
    }));

    // Upsert purchases to Supabase
    const { error: purchaseError } = await supabase
      .from('purchases')
      .upsert(transformedPurchases, { onConflict: 'id' });

    if (purchaseError) {
      throw new Error(`Failed to sync purchases: ${purchaseError.message}`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data: transformedPurchases,
      count: transformedPurchases.length,
      message: `Successfully synced ${transformedPurchases.length} purchase orders`
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
