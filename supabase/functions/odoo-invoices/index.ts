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

  let syncId: string | null = null;

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
    
    // Track execution time to prevent timeouts
    const startTime = Date.now();
    const maxExecutionTime = 8 * 60 * 1000; // 8 minutes max (Supabase functions timeout at 10 minutes)

    // Create sync status record
    const { data: syncStatus } = await supabase.rpc('update_sync_status', {
      p_sync_type: 'invoices',
      p_status: 'running'
    });
    
    if (syncStatus) {
      syncId = syncStatus;
    }

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

    // Get existing invoice names and IDs from Supabase to avoid duplicates
    const { data: existingInvoices, error: fetchError } = await supabase
      .from('invoices')
      .select('name, id');
    
    if (fetchError) {
      console.error('Failed to fetch existing invoices:', fetchError);
      throw new Error(`Failed to fetch existing invoices: ${fetchError.message}`);
    }
    
    const existingInvoiceNames = new Set(
      existingInvoices?.map(inv => inv.name).filter(name => name) || []
    );
    
    const existingInvoiceIds = new Set(
      existingInvoices?.map(inv => inv.id).filter(id => id) || []
    );

    console.log(`Found ${existingInvoiceNames.size} existing invoices in Supabase`);
    console.log('Existing invoice names (first 10):', Array.from(existingInvoiceNames).slice(0, 10));

    // Check if this is an incremental sync (if we have existing invoices)
    const isIncrementalSync = existingInvoiceNames.size > 0;
    
    // For incremental sync, only fetch invoices from the last 30 days to reduce timeout risk
    let dateFilter = [];
    if (isIncrementalSync) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const formattedDate = thirtyDaysAgo.toISOString().split('T')[0];
      dateFilter = [['invoice_date', '>=', formattedDate]];
      console.log(`[Incremental Sync] Fetching invoices from last 30 days (since ${formattedDate})`);
    } else {
      console.log(`[Full Sync] Fetching all invoices - this may take longer`);
    }

    // Add batching for fetching invoices with optimized limits
    const batchSize = parseInt(Deno.env.get('ODOO_INVOICE_BATCH_SIZE') || '100', 10);
    const delayMs = parseInt(Deno.env.get('ODOO_INVOICE_DELAY_MS') || '100', 10);
    
    // Use smaller batch size for incremental sync to be faster
    const fetchBatchSize = isIncrementalSync ? Math.min(batchSize, 200) : batchSize;
    
    let allInvoices: Invoice[] = [];
    let offset = 0;
    let hasMore = true;
    let fetchBatchCount = 0;
    const maxFetchBatches = isIncrementalSync ? 10 : 50; // Limit fetching for incremental sync
    
    while (hasMore && fetchBatchCount < maxFetchBatches) {
      console.log(`[Odoo Sync] Fetching invoices batch: offset ${offset}, limit ${fetchBatchSize}`);
      
      // Build search criteria with detailed logging
      const searchCriteria = [
        ['move_type', '=', 'out_invoice'],
        ['state', '=', 'posted'],
        ...dateFilter
      ];
      
      if (fetchBatchCount === 0) {
        console.log('SEARCH CRITERIA:', JSON.stringify(searchCriteria, null, 2));
      }
      
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
              [searchCriteria],
              {
                fields: ['name', 'partner_id', 'invoice_date', 'amount_total', 'state', 'invoice_line_ids'],
                order: 'invoice_date desc',
                limit: fetchBatchSize,
                offset: offset
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
      const batch = allInvoicesData.result || [];
      allInvoices = allInvoices.concat(batch);
      
      if (batch.length < fetchBatchSize) {
        hasMore = false;
      } else {
        offset += fetchBatchSize;
        fetchBatchCount++;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      // Check for timeout during fetching phase
      const fetchTimeElapsed = Date.now() - startTime;
      if (fetchTimeElapsed > maxExecutionTime * 0.3) { // Use max 30% of time for fetching
        console.log(`FETCH TIMEOUT PREVENTION: Stopping fetch after ${fetchTimeElapsed}ms. Fetched ${allInvoices.length} invoices.`);
        break;
      }
    }
    console.log(`[Odoo Sync] Total invoices fetched: ${allInvoices.length}`);
    console.log('DETAILED INVOICE ANALYSIS:');
    console.log('First 10 invoices from Odoo (newest):');
    allInvoices.slice(0, 10).forEach((inv, idx) => {
      console.log(`  ${idx + 1}. Name: "${inv.name}", Date: ${inv.invoice_date}, State: ${inv.state}, Partner: ${inv.partner_id?.[1] || 'Unknown'}`);
    });
    
    if (allInvoices.length > 10) {
      console.log('Last 10 invoices from Odoo (oldest):');
      allInvoices.slice(-10).forEach((inv, idx) => {
        console.log(`  ${allInvoices.length - 9 + idx}. Name: "${inv.name}", Date: ${inv.invoice_date}, State: ${inv.state}, Partner: ${inv.partner_id?.[1] || 'Unknown'}`);
      });
    }

    // Enhanced filtering to check both names and potential ID conflicts with detailed logging
    console.log('\n=== FILTERING ANALYSIS ===');
    const newInvoices: Invoice[] = [];
    const skippedInvoices: Array<{invoice: Invoice, reason: string}> = [];
    
    allInvoices.forEach((invoice: Invoice) => {
      const proposedId = invoice.name || invoice.id.toString();
      const nameExists = existingInvoiceNames.has(invoice.name);
      const idExists = existingInvoiceIds.has(proposedId);
      
      if (nameExists || idExists) {
        skippedInvoices.push({
          invoice,
          reason: nameExists ? `Name "${invoice.name}" already exists` : `ID "${proposedId}" already exists`
        });
      } else {
        newInvoices.push(invoice);
      }
    });

    console.log(`FILTERING RESULTS:`);
    console.log(`- Total invoices from Odoo: ${allInvoices.length}`);
    console.log(`- New invoices to process: ${newInvoices.length}`);
    console.log(`- Skipped invoices: ${skippedInvoices.length}`);
    
    if (skippedInvoices.length > 0) {
      console.log('\nTOP 10 SKIPPED INVOICES (most recent):');
      skippedInvoices.slice(0, 10).forEach((skipped, idx) => {
        console.log(`  ${idx + 1}. "${skipped.invoice.name}" (${skipped.invoice.invoice_date}) - ${skipped.reason}`);
      });
    }
    
    console.log('\nTOP 10 NEW INVOICES TO BE PROCESSED:');
    newInvoices.slice(0, 10).forEach((inv, idx) => {
      console.log(`  ${idx + 1}. "${inv.name}" (${inv.invoice_date}) - State: ${inv.state}`);
    });

    // Sort new invoices by date DESC to prioritize latest invoices
    const sortedNewInvoices = newInvoices.sort((a, b) => {
      const dateA = new Date(a.invoice_date || '1970-01-01').getTime();
      const dateB = new Date(b.invoice_date || '1970-01-01').getTime();
      return dateB - dateA; // Newest first
    });

    console.log(`${sortedNewInvoices.length} new invoices to process (after duplicate filtering, sorted by date DESC)`);
    console.log('NEW INVOICES (sorted by date):');
    console.log('First 10 (newest):', sortedNewInvoices.slice(0, 10).map(inv => 
      `${inv.name} (${inv.invoice_date})`
    ));
    console.log('Last 10 (oldest):', sortedNewInvoices.slice(-10).map(inv => 
      `${inv.name} (${inv.invoice_date})`
    ));
    
    // Log potentially conflicting invoices for debugging
    const conflictingInvoices = allInvoices.filter((invoice: Invoice) => {
      const proposedId = invoice.name || invoice.id.toString();
      return existingInvoiceNames.has(invoice.name) || existingInvoiceIds.has(proposedId);
    });
    
    if (conflictingInvoices.length > 0) {
      console.log(`Found ${conflictingInvoices.length} conflicting invoices:`);
      console.log('Conflicting invoice names:', conflictingInvoices.slice(0, 5).map(inv => 
        `${inv.name} (ID: ${inv.id}, Date: ${inv.invoice_date})`
      ));
    }

    if (sortedNewInvoices.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        totalInvoices: allInvoices.length,
        newInvoices: 0,
        message: 'All invoices are already synced'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process invoices in batches to avoid timeout - starting with newest invoices
    let totalSynced = 0;
    
    // Use smaller batch size for processing to reduce timeout risk
    const processingBatchSize = Math.min(batchSize, 50); // Cap at 50 for processing
    
    for (let i = 0; i < sortedNewInvoices.length; i += processingBatchSize) {
      const batch = sortedNewInvoices.slice(i, i + processingBatchSize);
      console.log(`Processing batch ${Math.floor(i/processingBatchSize) + 1}/${Math.ceil(sortedNewInvoices.length/processingBatchSize)}: ${batch.length} invoices`);
      console.log('Batch invoices (newest first):', batch.map(inv => `${inv.name} (${inv.invoice_date})`));

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
      console.log('Transformed invoice names:', transformedInvoices.map(inv => inv.name));

      // Insert invoices individually with conflict resolution
      let batchSyncedCount = 0;
      const failedInvoices: Array<{name: string, error: string}> = [];
      
      for (const invoice of transformedInvoices) {
        try {
          // Use upsert with conflict resolution
          const { error } = await supabase
            .from('invoices')
            .upsert(invoice, { 
              onConflict: 'name',
              ignoreDuplicates: false 
            });

          if (error) {
            console.error(`Error inserting invoice ${invoice.name}:`, error);
            failedInvoices.push({
              name: invoice.name,
              error: error.message || 'Unknown error'
            });
            
            // Try alternative insert with modified ID if unique constraint error
            if (error.code === '23505') { // Unique constraint violation
              const retryInvoice = {
                ...invoice,
                id: `${invoice.id}_retry_${Date.now()}`,
                name: `${invoice.name}_retry`
              };
              
              const { error: retryError } = await supabase
                .from('invoices')
                .insert(retryInvoice);
                
              if (!retryError) {
                console.log(`Successfully inserted invoice with retry ID: ${retryInvoice.name}`);
                batchSyncedCount++;
              } else {
                console.error(`Retry insert also failed for ${invoice.name}:`, retryError);
                failedInvoices[failedInvoices.length - 1].error = `Original: ${error.message}, Retry: ${retryError.message}`;
              }
            }
          } else {
            batchSyncedCount++;
            console.log(`Successfully inserted/updated invoice: ${invoice.name}`);
          }
        } catch (error) {
          console.error(`Catch error inserting invoice ${invoice.name}:`, error);
          failedInvoices.push({
            name: invoice.name,
            error: error instanceof Error ? error.message : 'Unknown catch error'
          });
        }
        
        // Small delay between inserts to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Log detailed results for this batch
      if (failedInvoices.length > 0) {
        console.log(`Batch ${Math.floor(i/batchSize) + 1} failed invoices:`, failedInvoices);
      }

      totalSynced += batchSyncedCount;
      console.log(`Batch ${Math.floor(i/processingBatchSize) + 1} completed: ${batchSyncedCount}/${transformedInvoices.length} invoices synced`);
      console.log(`Total progress: ${totalSynced}/${sortedNewInvoices.length} invoices synced so far`);
      
      // Add to existing invoice names to prevent duplicates in subsequent batches
      transformedInvoices.forEach(invoice => {
        existingInvoiceNames.add(invoice.name);
      });

      // Update sync status with progress if we have syncId
      if (syncId && totalSynced > 0) {
        await supabase.rpc('update_sync_status', {
          p_sync_type: 'invoices',
          p_status: 'running',
          p_total_records: sortedNewInvoices.length,
          p_synced_records: totalSynced,
          p_failed_records: sortedNewInvoices.length - totalSynced
        });
      }

      // Delay between batches to prevent CPU exhaustion
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check for timeout risk - exit early if we're approaching the limit
      const timeElapsed = Date.now() - startTime;
      const timeRemaining = maxExecutionTime - timeElapsed;
      
      if (timeRemaining < 60000 && i + processingBatchSize < sortedNewInvoices.length) { // Less than 1 minute remaining
        console.log(`TIMEOUT PREVENTION: Stopping sync after ${totalSynced} invoices due to time limit. Time elapsed: ${Math.round(timeElapsed/1000)}s`);
        console.log(`Remaining ${sortedNewInvoices.length - totalSynced} invoices will be synced in the next run.`);
        break;
      }
      
      // Also exit early if we've processed a significant number to ensure latest invoices are prioritized
      if (totalSynced >= 150 && i + processingBatchSize < sortedNewInvoices.length) {
        console.log(`BATCH LIMIT: Successfully synced ${totalSynced} invoices including newest ones. Remaining invoices can be synced in next run.`);
        break;
      }
    }

    console.log(`Sync completed. ${totalSynced}/${sortedNewInvoices.length} new invoices synced to Supabase.`);
    
    // Check if there were any failures
    const failedCount = sortedNewInvoices.length - totalSynced;
    if (failedCount > 0) {
      console.log(`WARNING: ${failedCount} invoices failed to sync`);
    }

    // Update sync status to completed
    if (syncId) {
      await supabase.rpc('update_sync_status', {
        p_sync_type: 'invoices',
        p_status: failedCount > 0 ? 'completed_with_errors' : 'completed',
        p_total_records: sortedNewInvoices.length,
        p_synced_records: totalSynced,
        p_failed_records: failedCount,
        p_error_message: failedCount > 0 ? `${failedCount} invoices failed to sync` : null
      });
    }

    const isSuccess = totalSynced > 0 || newInvoices.length === 0;
    
    return new Response(JSON.stringify({ 
      success: isSuccess, 
      totalInvoices: allInvoices.length,
      newInvoices: sortedNewInvoices.length,
      syncedToSupabase: totalSynced,
      failedToSync: failedCount,
      conflictingInvoices: conflictingInvoices.length,
      message: `Successfully synced ${totalSynced} new invoices with proper Odoo product categories and order lines${failedCount > 0 ? ` (${failedCount} failed)` : ''}${conflictingInvoices.length > 0 ? `. ${conflictingInvoices.length} invoices were skipped due to existing records.` : ''}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in odoo-invoices function:', error);
    
    // Update sync status to failed
    if (syncId) {
      try {
        await supabase.rpc('update_sync_status', {
          p_sync_type: 'invoices',
          p_status: 'failed',
          p_error_message: error instanceof Error ? error.message : 'Unknown error'
        });
      } catch (statusError) {
        console.error('Failed to update sync status:', statusError);
      }
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      totalInvoices: 0,
      newInvoices: 0,
      syncedToSupabase: 0,
      failedToSync: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
