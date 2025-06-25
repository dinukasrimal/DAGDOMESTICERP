
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  product_id: [number, string];
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

    if (!odooUrl || !odooDatabase || !odooUsername || !odooPassword) {
      throw new Error('Missing Odoo configuration');
    }

    console.log('Fetching invoice data from Odoo...');

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

    // Fetch customer invoices
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
              limit: 100,
              order: 'invoice_date desc'
            }
          ]
        },
        id: Math.floor(Math.random() * 1000000)
      }),
    });

    const invoicesData = await invoicesResponse.json();
    console.log('Invoice data received:', invoicesData);

    if (invoicesData.error) {
      throw new Error(`Odoo API error: ${invoicesData.error.message}`);
    }

    const invoices = invoicesData.result || [];
    
    // Get all invoice line IDs
    const allLineIds = invoices.flatMap((inv: Invoice) => inv.invoice_line_ids || []);
    
    let invoiceLines: InvoiceLine[] = [];
    
    if (allLineIds.length > 0) {
      // Fetch invoice lines
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
                fields: ['id', 'product_id', 'quantity', 'price_unit', 'price_subtotal', 'move_id']
              }
            ]
          },
          id: Math.floor(Math.random() * 1000000)
        }),
      });

      const linesData = await linesResponse.json();
      if (!linesData.error) {
        invoiceLines = linesData.result || [];
      }
    }

    const transformedInvoices = invoices.map((invoice: Invoice) => {
      const lines = invoiceLines.filter((line: any) => 
        invoice.invoice_line_ids && invoice.invoice_line_ids.includes(line.id)
      );
      
      const orderLines = lines
        .filter((line: any) => line.product_id && line.product_id[1])
        .map((line: any) => ({
          product_name: line.product_id[1],
          qty_delivered: line.quantity || 0,
          price_unit: line.price_unit || 0,
          price_subtotal: line.price_subtotal || 0,
          product_category: getProductCategory(line.product_id[1])
        }));

      return {
        id: invoice.name || invoice.id.toString(),
        name: invoice.name,
        partner_name: Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : 'Unknown Customer',
        date_order: invoice.invoice_date ? invoice.invoice_date : new Date().toISOString().split('T')[0],
        amount_total: invoice.amount_total || 0,
        state: 'sale', // Invoices are considered as completed sales
        order_lines: orderLines
      };
    });

    return new Response(JSON.stringify({ 
      success: true, 
      data: transformedInvoices,
      count: transformedInvoices.length
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

// Helper function to determine product category based on product name
function getProductCategory(productName: string): string {
  if (!productName) return 'OTHER';
  
  const name = productName.toUpperCase();
  
  if (name.includes('SOLACE')) return 'SOLACE';
  if (name.includes('DELI')) return 'DELI';
  if (name.includes('FEER')) return 'FEER';
  if (name.includes('BOXER')) return 'BOXER';
  
  return 'OTHER';
}
