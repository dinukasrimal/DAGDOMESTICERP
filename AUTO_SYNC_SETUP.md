# Auto-Sync Setup Guide (2-Hour Intervals)

This guide explains how to set up automatic synchronization with Odoo every 2 hours to resolve invoice sync issues and enable scheduled syncing.

## 🚀 Quick Setup

### 1. Apply Database Migration

First, apply the database migration to fix sync constraints:

```bash
# Run the migration to add proper constraints and sync status tracking
supabase db push
```

This migration:
- ✅ Adds unique constraints on invoice names to prevent duplicates
- ✅ Creates indexes for better performance
- ✅ Sets up sync status tracking table
- ✅ Handles existing duplicate data gracefully

### 2. Configure Environment Variables

Add these environment variables to your Supabase project:

```bash
# Auto-sync configuration - SET TO 2 HOURS (120 minutes)
AUTO_SYNC_ENABLED=true
AUTO_SYNC_INTERVAL_MINUTES=120
AUTO_SYNC_TYPES=invoices,purchases,sales,products,inventory

# Batch processing optimization
ODOO_INVOICE_BATCH_SIZE=100
ODOO_INVOICE_DELAY_MS=100
```

### 3. Deploy Edge Functions

Deploy the enhanced edge functions:

```bash
# Deploy the enhanced invoice sync function
supabase functions deploy odoo-invoices

# Deploy the new auto-sync function
supabase functions deploy auto-sync
```

### 4. Set Up 2-Hour Scheduled Sync

For automatic scheduling every 2 hours, set up the cron job:

```sql
-- Run this in your Supabase SQL editor
-- Replace 'your-project' with your actual project reference

-- First, enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Set up service role key for cron jobs
ALTER DATABASE postgres SET app.settings.service_role_key = 'your_service_role_key_here';

-- Schedule auto-sync every 2 hours
SELECT cron.schedule(
    'odoo-auto-sync',
    '0 */2 * * *',  -- Every 2 hours at minute 0 (00:00, 02:00, 04:00, etc.)
    $$
    SELECT
      net.http_post(
          url:='https://your-project.supabase.co/functions/v1/auto-sync',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
);
```

## 🔧 Features Implemented

### Enhanced Invoice Sync
- **Unique Constraints**: Prevents duplicate invoices
- **Better Error Handling**: Individual invoice retry logic
- **Conflict Resolution**: Handles ID conflicts gracefully
- **Comprehensive Logging**: Detailed sync failure tracking

### Auto-Sync Mechanism
- **Configurable Intervals**: Set sync frequency via environment variables
- **Selective Syncing**: Choose which data types to auto-sync
- **Status Tracking**: Monitor sync success/failure rates
- **Smart Scheduling**: Only runs sync when needed based on last sync time

### Sync Status Monitoring
- **Real-time Status**: Visual sync status in Reports page
- **Detailed Metrics**: Shows synced/failed record counts
- **Error Reporting**: Clear indication of sync issues
- **Historical Tracking**: Track sync performance over time

## 🎯 How It Fixes Your Issues

### Problem 1: Missing Latest Invoices
**Root Cause**: Race conditions and missing unique constraints
**Solution**: 
- ✅ Added unique constraints to prevent conflicts
- ✅ Enhanced duplicate detection logic
- ✅ Individual invoice processing with retry logic

### Problem 2: Manual Sync Required
**Root Cause**: No automatic synchronization
**Solution**:
- ✅ Auto-sync function with configurable intervals
- ✅ Scheduled cron jobs for automation
- ✅ Smart sync timing based on last sync timestamp

### Problem 3: Poor Error Visibility
**Root Cause**: Silent failures with minimal logging
**Solution**:
- ✅ Comprehensive logging for each sync operation
- ✅ Visual sync status dashboard
- ✅ Detailed error messages and retry attempts

## 📊 Monitoring & Usage

### View Sync Status
1. Go to Reports & Analytics page
2. Check the "Sync Status" panel at the top
3. Monitor sync success/failure rates

### Manual Sync (Enhanced)
- Click "Refresh Data" in Reports page
- Now triggers ALL Odoo syncs (invoices, purchases, sales, products, inventory)
- Shows progress indicator and detailed results

### Auto-Sync Status
Call the auto-sync endpoint to check status:
```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/auto-sync' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY'
```

## 🔍 Troubleshooting

### If Invoices Still Missing
1. Check Odoo invoice states (must be 'posted')
2. Verify invoice names are unique in Odoo
3. Check sync status logs for specific errors
4. Run manual sync to see detailed error messages

### If Auto-Sync Not Working
1. Verify environment variables are set
2. Check cron job is scheduled: `SELECT * FROM cron.job;`
3. Monitor auto-sync function logs
4. Ensure sufficient database permissions

### Performance Issues
1. Adjust `ODOO_INVOICE_BATCH_SIZE` (default: 100)
2. Increase `ODOO_INVOICE_DELAY_MS` (default: 100ms)
3. Reduce auto-sync frequency if needed

## 🎉 Expected Results

After setup:
1. **Latest invoices will sync automatically** every 2 hours (00:00, 02:00, 04:00, etc.)
2. **Manual refresh works completely** - triggers all sync types
3. **Clear visibility** into sync status and any failures
4. **No more duplicate invoice issues** due to proper constraints
5. **Old PO updates sync properly** when received quantities change

## 🕒 2-Hour Sync Schedule Details

The system will automatically sync:
- **00:00** (midnight) - Full sync of all data types
- **02:00** (2 AM) - Incremental sync for latest changes
- **04:00** (4 AM) - Incremental sync for latest changes
- **06:00** (6 AM) - Incremental sync for latest changes
- **08:00** (8 AM) - Incremental sync for latest changes
- **10:00** (10 AM) - Incremental sync for latest changes
- **12:00** (noon) - Incremental sync for latest changes
- **14:00** (2 PM) - Incremental sync for latest changes
- **16:00** (4 PM) - Incremental sync for latest changes
- **18:00** (6 PM) - Incremental sync for latest changes
- **20:00** (8 PM) - Incremental sync for latest changes
- **22:00** (10 PM) - Incremental sync for latest changes

## 📊 Monitoring 2-Hour Sync

### Check Next Sync Time
```sql
SELECT 
    jobname,
    schedule,
    active,
    last_run_start_time,
    -- Calculate next run time based on 2-hour schedule
    CASE 
        WHEN EXTRACT(MINUTE FROM NOW()) = 0 THEN NOW()
        ELSE DATE_TRUNC('hour', NOW()) + INTERVAL '2 hours' - (EXTRACT(HOUR FROM NOW()) % 2) * INTERVAL '1 hour'
    END as next_run_time
FROM cron.job 
WHERE jobname = 'odoo-auto-sync';
```

### View 2-Hour Sync History
```sql
SELECT 
    start_time,
    end_time,
    status,
    return_message
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'odoo-auto-sync')
ORDER BY start_time DESC 
LIMIT 12; -- Show last 24 hours (12 runs × 2 hours)
```

The enhanced system ensures reliable, automatic synchronization every 2 hours with comprehensive error handling and monitoring.