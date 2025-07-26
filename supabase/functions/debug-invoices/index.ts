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

    console.log('=== COMPREHENSIVE INVOICE DEBUG ===');

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

    console.log('✅ Authenticated successfully with Odoo');

    // Get the last 50 invoices in ALL states to see what's actually in Odoo
    console.log('\n=== FETCHING LATEST INVOICES IN ALL STATES ===');
    const recentInvoicesResponse = await fetch(`${odooUrl}/jsonrpc`, {
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
              [['move_type', '=', 'out_invoice']] // All invoice states
            ],
            {
              fields: ['name', 'partner_id', 'invoice_date', 'amount_total', 'state', 'create_date', 'write_date'],
              order: 'create_date desc', // Sort by creation date
              limit: 50
            }
          ]
        },
        id: Math.floor(Math.random() * 1000000)
      }),
    });

    const recentInvoicesData = await recentInvoicesResponse.json();
    if (recentInvoicesData.error) {
      throw new Error(`Failed to fetch recent invoices: ${recentInvoicesData.error.message}`);
    }

    const recentInvoices = recentInvoicesData.result || [];
    console.log(`\n📋 LATEST ${recentInvoices.length} INVOICES IN ODOO (all states):`);
    
    recentInvoices.forEach((inv: any, idx: number) => {
      console.log(`${idx + 1}. "${inv.name}" | State: ${inv.state} | Date: ${inv.invoice_date} | Created: ${inv.create_date} | Partner: ${inv.partner_id?.[1] || 'Unknown'}`);
    });

    // Count by state
    const stateCount: {[key: string]: number} = {};
    recentInvoices.forEach((inv: any) => {
      stateCount[inv.state] = (stateCount[inv.state] || 0) + 1;
    });

    console.log('\n📊 INVOICE STATES BREAKDOWN:');
    Object.entries(stateCount).forEach(([state, count]) => {
      console.log(`  ${state}: ${count} invoices`);
    });

    // Get existing invoices from Supabase
    const { data: existingInvoices, error: fetchError } = await supabase
      .from('invoices')
      .select('name, id')
      .order('created_at', { ascending: false })
      .limit(20);

    if (fetchError) {
      console.error('Failed to fetch existing invoices:', fetchError);
    } else {
      console.log(`\n💾 LATEST ${existingInvoices?.length || 0} INVOICES IN SUPABASE:`);
      existingInvoices?.forEach((inv, idx) => {
        console.log(`${idx + 1}. "${inv.name}" | ID: ${inv.id}`);
      });
    }

    // Cross-reference: Check which recent Odoo invoices are missing from Supabase
    const existingNames = new Set(existingInvoices?.map(inv => inv.name) || []);
    const missingInvoices = recentInvoices.filter((inv: any) => !existingNames.has(inv.name));

    console.log(`\n🔍 MISSING INVOICES ANALYSIS:`);
    console.log(`Total recent invoices in Odoo: ${recentInvoices.length}`);
    console.log(`Already in Supabase: ${recentInvoices.length - missingInvoices.length}`);
    console.log(`Missing from Supabase: ${missingInvoices.length}`);

    if (missingInvoices.length > 0) {
      console.log('\n❌ INVOICES MISSING FROM SUPABASE:');
      missingInvoices.forEach((inv: any, idx: number) => {
        const reason = inv.state !== 'posted' ? `❗ State is '${inv.state}' (not 'posted')` : '✅ State is posted - should sync';
        console.log(`${idx + 1}. "${inv.name}" | ${reason} | Date: ${inv.invoice_date}`);
      });

      // Focus on the missing posted invoices
      const missingPostedInvoices = missingInvoices.filter((inv: any) => inv.state === 'posted');
      console.log(`\n🎯 MISSING POSTED INVOICES (should sync): ${missingPostedInvoices.length}`);
      missingPostedInvoices.forEach((inv: any, idx: number) => {
        console.log(`${idx + 1}. "${inv.name}" | Date: ${inv.invoice_date} | Amount: ${inv.amount_total} | Partner: ${inv.partner_id?.[1]}`);
      });
    }

    // Check for potential name conflicts
    console.log(`\n🔄 DUPLICATE NAME CHECK:`);
    const nameCount: {[key: string]: number} = {};
    recentInvoices.forEach((inv: any) => {
      if (inv.name) {
        nameCount[inv.name] = (nameCount[inv.name] || 0) + 1;
      }
    });

    const duplicateNames = Object.entries(nameCount).filter(([name, count]) => count > 1);
    if (duplicateNames.length > 0) {
      console.log('⚠️ DUPLICATE INVOICE NAMES FOUND IN ODOO:');
      duplicateNames.forEach(([name, count]) => {
        console.log(`  "${name}" appears ${count} times`);
      });
    } else {
      console.log('✅ No duplicate invoice names in recent Odoo invoices');
    }

    return new Response(JSON.stringify({
      success: true,
      summary: {
        totalRecentInvoices: recentInvoices.length,
        existingInSupabase: recentInvoices.length - missingInvoices.length,
        missingFromSupabase: missingInvoices.length,
        missingPostedInvoices: missingInvoices.filter((inv: any) => inv.state === 'posted').length,
        stateBreakdown: stateCount,
        duplicateNames: duplicateNames.length
      },
      recentInvoices: recentInvoices.slice(0, 10),
      missingInvoices: missingInvoices.slice(0, 10),
      existingInSupabase: existingInvoices?.slice(0, 10) || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in debug-invoices function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});