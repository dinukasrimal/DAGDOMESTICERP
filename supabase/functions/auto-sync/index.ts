import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncResult {
  syncType: string;
  success: boolean;
  error?: string;
  totalRecords?: number;
  syncedRecords?: number;
  failedRecords?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting auto-sync process...');

    // Get sync configuration from environment or use defaults
    const autoSyncEnabled = Deno.env.get('AUTO_SYNC_ENABLED') !== 'false';
    const syncInterval = parseInt(Deno.env.get('AUTO_SYNC_INTERVAL_MINUTES') || '60', 10);
    const enabledSyncs = (Deno.env.get('AUTO_SYNC_TYPES') || 'invoices,purchases,sales,products,inventory').split(',');

    if (!autoSyncEnabled) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Auto-sync is disabled',
        enabled: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if we should run sync based on last sync time
    const { data: lastSyncData } = await supabase
      .from('sync_status')
      .select('sync_type, last_sync_timestamp')
      .in('sync_type', enabledSyncs)
      .order('last_sync_timestamp', { ascending: false });

    const now = new Date();
    const syncThresholdMs = syncInterval * 60 * 1000; // Convert minutes to milliseconds

    // Determine which syncs need to run
    const syncsToRun: string[] = [];
    
    for (const syncType of enabledSyncs) {
      const lastSync = lastSyncData?.find(s => s.sync_type === syncType);
      
      if (!lastSync) {
        // No previous sync record, run it
        syncsToRun.push(syncType);
      } else {
        const lastSyncTime = new Date(lastSync.last_sync_timestamp);
        const timeSinceLastSync = now.getTime() - lastSyncTime.getTime();
        
        if (timeSinceLastSync >= syncThresholdMs) {
          syncsToRun.push(syncType);
        }
      }
    }

    console.log(`Syncs to run: ${syncsToRun.join(', ')}`);

    if (syncsToRun.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'All syncs are up to date',
        nextSyncDue: 'Not needed',
        lastSyncs: lastSyncData
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Execute syncs in parallel
    const syncPromises = syncsToRun.map(async (syncType): Promise<SyncResult> => {
      try {
        console.log(`Starting ${syncType} sync...`);
        
        const functionName = `odoo-${syncType}`;
        const { data, error } = await supabase.functions.invoke(functionName);

        if (error) {
          console.error(`${syncType} sync failed:`, error);
          return {
            syncType,
            success: false,
            error: error.message || 'Unknown error'
          };
        }

        if (data && data.success !== false) {
          console.log(`${syncType} sync completed successfully`);
          return {
            syncType,
            success: true,
            totalRecords: data.totalInvoices || data.totalRecords || data.count || 0,
            syncedRecords: data.syncedToSupabase || data.syncedRecords || data.count || 0,
            failedRecords: data.failedToSync || data.failedRecords || 0
          };
        } else {
          return {
            syncType,
            success: false,
            error: data?.error || 'Sync function returned unsuccessful result'
          };
        }
      } catch (error) {
        console.error(`Error in ${syncType} sync:`, error);
        return {
          syncType,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const syncResults = await Promise.all(syncPromises);

    // Summary of results
    const successfulSyncs = syncResults.filter(r => r.success);
    const failedSyncs = syncResults.filter(r => !r.success);

    const totalSynced = successfulSyncs.reduce((sum, r) => sum + (r.syncedRecords || 0), 0);

    console.log(`Auto-sync completed. ${successfulSyncs.length}/${syncResults.length} syncs successful. Total records synced: ${totalSynced}`);

    const isOverallSuccess = failedSyncs.length === 0;
    const status = isOverallSuccess ? 'completed' : 'completed_with_errors';

    // Update overall sync status
    await supabase.rpc('update_sync_status', {
      p_sync_type: 'auto_sync',
      p_status: status,
      p_total_records: syncResults.length,
      p_synced_records: successfulSyncs.length,
      p_failed_records: failedSyncs.length,
      p_error_message: failedSyncs.length > 0 ? 
        `Failed syncs: ${failedSyncs.map(s => s.syncType).join(', ')}` : null
    });

    return new Response(JSON.stringify({
      success: isOverallSuccess,
      message: `Auto-sync completed. ${successfulSyncs.length}/${syncResults.length} syncs successful.`,
      syncResults,
      totalRecordsSynced: totalSynced,
      nextSyncDue: new Date(now.getTime() + syncThresholdMs).toISOString(),
      configuration: {
        enabled: autoSyncEnabled,
        intervalMinutes: syncInterval,
        enabledSyncs
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in auto-sync function:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Auto-sync process failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});