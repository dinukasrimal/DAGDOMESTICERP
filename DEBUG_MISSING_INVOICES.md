# Debug Guide: Missing Latest Invoices

## 🚨 Issue Still Persisting

Despite timeout fixes, the latest 2 invoices are still not syncing. Let's systematically debug this.

## 🔍 Step-by-Step Debugging Process

### **Step 1: Deploy Debug Function**

First, deploy the new debug function:

```bash
supabase functions deploy debug-invoices
3 bl  # Enhanced version with detailed logging
```

### **Step 2: Run Comprehensive Analysis**

1. Go to **Reports & Analytics** page
2. Click the **"Debug Sync"** button (orange button)
3. Check the browser console for detailed output
4. Look for the toast message showing missing invoice count

### **Step 3: Analyze Debug Output**

The debug function will show:

#### **A. Latest Invoices in Odoo (All States)**
```
📋 LATEST 50 INVOICES IN ODOO (all states):
1. "INV/2024/001" | State: posted | Date: 2024-01-26 | Partner: Customer A
2. "INV/2024/002" | State: draft | Date: 2024-01-26 | Partner: Customer B
3. "INV/2024/003" | State: posted | Date: 2024-01-25 | Partner: Customer C
```

#### **B. State Breakdown**
```
📊 INVOICE STATES BREAKDOWN:
  posted: 45 invoices
  draft: 3 invoices
  cancel: 2 invoices
```

#### **C. Missing Invoices Analysis**
```
🔍 MISSING INVOICES ANALYSIS:
❌ INVOICES MISSING FROM SUPABASE:
1. "INV/2024/001" | ✅ State is posted - should sync | Date: 2024-01-26
2. "INV/2024/002" | ❗ State is 'draft' (not 'posted') | Date: 2024-01-26
```

### **Step 4: Identify Root Causes**

Based on the debug output, identify the issue:

#### **Scenario A: Latest Invoices Are in Draft State**
- **Problem**: Invoices are not in 'posted' state in Odoo
- **Solution**: Check with accounting team to post the invoices in Odoo
- **Command**: The sync only fetches invoices with `state = 'posted'`

#### **Scenario B: Latest Invoices Are Posted But Still Missing**
- **Problem**: Filtering or database constraint issues
- **Solution**: Check for duplicate names or database conflicts

#### **Scenario C: Timeout During Fetch Phase**
- **Problem**: Function times out before reaching latest invoices
- **Solution**: Reduce batch sizes or implement better incremental sync

### **Step 5: Enhanced Sync Logging**

After debugging, run the enhanced sync to see detailed filtering:

1. Click **"Refresh Data"** 
2. Check console for detailed output:

```
=== FILTERING ANALYSIS ===
FILTERING RESULTS:
- Total invoices from Odoo: 1250
- New invoices to process: 5
- Skipped invoices: 1245

TOP 10 SKIPPED INVOICES (most recent):
1. "INV/2024/001" (2024-01-26) - Name "INV/2024/001" already exists
2. "INV/2024/002" (2024-01-25) - Name "INV/2024/002" already exists

TOP 10 NEW INVOICES TO BE PROCESSED:
1. "INV/2024/003" (2024-01-24) - State: posted
2. "INV/2024/004" (2024-01-23) - State: posted
```

## 🎯 Most Likely Causes & Solutions

### **1. Invoice State Issue (Most Common)**
**Symptoms**: Debug shows missing invoices with "State is 'draft'" 
**Solution**: 
- Invoices need to be **posted** in Odoo accounting module
- Only posted invoices are synced for data integrity
- Ask accounting team to post recent invoices

### **2. Duplicate Name Conflict**
**Symptoms**: Debug shows "Name already exists" for recent invoices
**Solution**:
- Check if invoice names were manually duplicated
- Clear duplicate entries from Supabase if needed
- Apply the unique constraint migration

### **3. Date Filtering Issue**
**Symptoms**: Recent invoices not being fetched from Odoo at all
**Solution**:
- Check if incremental sync date filter is too restrictive
- Temporary fix: Set `existingInvoiceNames.size = 0` to force full sync

### **4. Time Zone Issues**
**Symptoms**: Invoices with today's date not appearing
**Solution**:
- Check Odoo server timezone vs application timezone
- Adjust date filtering to account for timezone differences

### **5. Field Mapping Issues**
**Symptoms**: Invoices fetched but failing during transformation
**Solution**:
- Check if invoice names are null/empty
- Verify partner_id format in latest invoices

## 🔧 Quick Fixes to Try

### **Fix 1: Force Full Sync (Bypass Incremental)**
Add this environment variable temporarily:
```bash
FORCE_FULL_SYNC=true
```

### **Fix 2: Reduce Date Range Filter**
If using incremental sync, try reducing the date range:
```typescript
// Change from 30 days to 7 days
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 7);
```

### **Fix 3: Disable State Filtering Temporarily**
For testing, modify the search criteria to include draft invoices:
```typescript
// Remove state filter temporarily
const searchCriteria = [
  ['move_type', '=', 'out_invoice']
  // ['state', '=', 'posted'], // Comment out temporarily
];
```

### **Fix 4: Manual Invoice Name Check**
Run this query in Supabase SQL editor:
```sql
SELECT name, created_at 
FROM invoices 
WHERE name LIKE 'INV/2024%' 
ORDER BY created_at DESC 
LIMIT 10;
```

## 📞 Next Steps

1. **Run Debug Analysis**: Use the Debug Sync button and share the console output
2. **Check Invoice States**: Verify the latest 2 invoices are "posted" in Odoo
3. **Review Filtering**: Look for "already exists" messages in the filtering analysis
4. **Test Quick Fixes**: Try the fixes above based on the debug results

The debug function will pinpoint exactly why your latest invoices aren't syncing!

## 🆘 Emergency Manual Sync

If you need to manually sync specific invoices, you can:

1. Note the exact invoice names from Odoo
2. Temporarily clear them from Supabase if they exist:
   ```sql
   DELETE FROM invoices WHERE name IN ('INV/2024/001', 'INV/2024/002');
   ```
3. Run the sync again
4. They should now be processed as "new" invoices

**Remember to run the debug analysis first to understand the root cause!**