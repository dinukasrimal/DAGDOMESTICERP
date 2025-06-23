
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PurchaseOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  date_order: string;
  amount_total: number;
  state: string;
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

    if (!odooUrl || !odooDatabase || !odooUsername || !odooPassword) {
      throw new Error('Missing Odoo configuration');
    }

    console.log('Fetching purchase data from Odoo...');

    // First authenticate
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
            [[]],  // domain (empty = all records)
            {
              fields: ['name', 'partner_id', 'date_order', 'amount_total', 'state'],
              limit: 50,
              order: 'date_order desc'
            }
          ]
        },
        id: Math.floor(Math.random() * 1000000)
      }),
    });

    const purchaseData = await purchaseResponse.json();
    console.log('Purchase data received:', purchaseData);

    if (purchaseData.error) {
      throw new Error(`Odoo API error: ${purchaseData.error.message}`);
    }

    const orders = purchaseData.result || [];
    const transformedOrders = orders.map((order: PurchaseOrder) => ({
      id: order.name || order.id.toString(),
      name: order.name,
      partner_name: Array.isArray(order.partner_id) ? order.partner_id[1] : 'Unknown Supplier',
      date_order: order.date_order ? order.date_order.split(' ')[0] : new Date().toISOString().split('T')[0],
      amount_total: order.amount_total || 0,
      state: order.state || 'draft'
    }));

    return new Response(JSON.stringify({ 
      success: true, 
      data: transformedOrders,
      count: transformedOrders.length
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
