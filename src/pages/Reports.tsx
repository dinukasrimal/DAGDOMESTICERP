import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReportDialog } from '@/components/reports/ReportDialog';
import { SalesReportContent } from '@/components/reports/SalesReportContent';
import { AdvancedInventoryReport } from '@/components/reports/AdvancedInventoryReport';
import { SalesTargetDialog } from '@/components/reports/SalesTargetDialog';
import { SavedTargetsManager } from '@/components/reports/SavedTargetsManager';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { FileText, BarChart3, Package, Download, RefreshCw, ArrowLeft, Target, Calendar, Settings, Home, Users, Sparkles, ClipboardList, CheckCircle, XCircle, Clock, AlertCircle, RotateCcw, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabaseBatchFetch, SupabaseTable } from '@/lib/utils';

interface SalesData {
  id: string;
  name: string;
  partner_name: string;
  date_order: string;
  amount_total: number;
  state: string;
  order_lines?: Array<{
    product_name: string;
    qty_delivered: number;
    price_unit: number;
    price_subtotal: number;
    product_category: string;
  }>;
}

interface PurchaseData {
  id: string;
  name: string;
  partner_name: string;
  date_order: string;
  amount_total: number;
  state: string;
  received_qty?: number;
  pending_qty?: number;
  expected_date?: string;
}

const Reports: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeDialog, setActiveDialog] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<any[]>([]);
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseData[]>([]);
  const [showTargetsDialog, setShowTargetsDialog] = useState(false);
  const [autoSyncStatus, setAutoSyncStatus] = useState<any>(null);

  const fetchSalesData = async () => {
    setIsLoading(true);
    try {
      // Fetch all sales data in batches
      const localData = await supabaseBatchFetch('invoices', 'date_order', 1000);
      if (localData && localData.length > 0) {
        const transformedData: SalesData[] = localData.map(invoice => ({
          id: invoice.id,
          name: invoice.name || '',
          partner_name: invoice.partner_name || '',
          date_order: invoice.date_order || '',
          amount_total: invoice.amount_total || 0,
          state: invoice.state || '',
          order_lines: Array.isArray(invoice.order_lines) 
            ? invoice.order_lines as Array<{
                product_name: string;
                qty_delivered: number;
                price_unit: number;
                price_subtotal: number;
                product_category: string;
              }>
            : []
        }));
        setSalesData(transformedData);
      } else {
        await syncFromOdoo();
      }
    } catch (error) {
      console.error('Error fetching sales data:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch sales data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const syncFromOdoo = async () => {
    try {
      console.log('Syncing from Odoo...');
      const { data, error } = await supabase.functions.invoke('odoo-invoices');
      
      if (error) {
        throw new Error(`Failed to sync invoice data: ${error.message}`);
      }

      if (data.success) {
        console.log('Invoice data synced successfully:', data.syncedToSupabase, 'new records');
        toast({
          title: "Data Synced",
          description: data.message || `${data.syncedToSupabase} invoices synced successfully`,
        });
        
        // Refetch data after sync
        await fetchSalesData();
      } else {
        throw new Error(data.error || 'Failed to sync invoice data');
      }
    } catch (error) {
      console.error('Sync from Odoo failed:', error);
      toast({
        title: "Sync Error",
        description: error instanceof Error ? error.message : "Failed to sync from Odoo",
        variant: "destructive",
      });
    }
  };

  const syncFromOdooPurchases = async () => {
    try {
      console.log('Syncing purchases from Odoo...');
      const { data, error } = await supabase.functions.invoke('odoo-purchases');
      if (error) {
        throw new Error(`Failed to sync purchase data: ${error.message}`);
      }
      if (data.success) {
        console.log('Purchase data synced successfully:', data.count, 'records');
        toast({
          title: 'Purchases Synced',
          description: data.message || `${data.count} purchases synced successfully`,
        });
      } else {
        throw new Error(data.error || 'Failed to sync purchase data');
      }
    } catch (error) {
      console.error('Sync from Odoo (purchases) failed:', error);
      toast({
        title: 'Sync Error',
        description: error instanceof Error ? error.message : 'Failed to sync purchases from Odoo',
        variant: 'destructive',
      });
    }
  };

  const fetchPurchaseData = async () => {
    setIsLoading(true);
    try {
      // Fetch all purchase data in batches
      const data = await supabaseBatchFetch('purchases', 'date_order', 1000);
      if (data) {
        const transformedData: PurchaseData[] = data.map(purchase => ({
          id: purchase.id,
          name: purchase.name || '',
          partner_name: purchase.partner_name || '',
          date_order: purchase.date_order || '',
          amount_total: purchase.amount_total || 0,
          state: purchase.state || '',
          received_qty: purchase.received_qty || 0,
          pending_qty: purchase.pending_qty || 0,
          expected_date: purchase.expected_date
        }));
        setPurchaseData(transformedData);
      }
    } catch (error) {
      console.error('Purchase data fetch failed:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch purchase data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const syncProductsFromOdoo = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('odoo-products');
      if (error || !data.success) {
        throw new Error(data?.error || error?.message || 'Failed to sync products from Odoo');
      }
      toast({
        title: "Products Synced",
        description: `Synced ${data.count} products from Odoo.`,
      });
    } catch (error) {
      toast({
        title: "Product Sync Error",
        description: error instanceof Error ? error.message : "Failed to sync products from Odoo",
        variant: "destructive",
      });
    }
  };

  const syncInventoryFromOdoo = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('odoo-inventory');
      if (error || !data.success) {
        throw new Error(data?.error || error?.message || 'Failed to sync inventory from Odoo');
      }
      toast({
        title: "Inventory Synced",
        description: `Synced ${data.count} inventory records from Odoo.`,
      });
    } catch (error) {
      toast({
        title: "Inventory Sync Error",
        description: error instanceof Error ? error.message : "Failed to sync inventory from Odoo",
        variant: "destructive",
      });
    }
  };

  const fetchSyncStatus = async () => {
    try {
      // Clean up stale running sync records older than 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await supabase
        .from('sync_status')
        .update({ status: 'failed', error_message: 'Sync timed out or was interrupted' })
        .eq('status', 'running')
        .lt('last_sync_timestamp', tenMinutesAgo);

      const { data, error } = await supabase
        .from('sync_status')
        .select('*')
        .order('last_sync_timestamp', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Failed to fetch sync status:', error);
      } else {
        setSyncStatus(data || []);
      }
    } catch (error) {
      console.error('Error fetching sync status:', error);
    }
  };

  useEffect(() => {
    fetchSalesData();
    fetchPurchaseData();
    fetchSyncStatus();
    checkAutoSyncStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDialog = (dialogType: string) => {
    setActiveDialog(dialogType);
  };

  const closeDialog = () => {
    setActiveDialog(null);
  };

  const handleDownloadPdf = () => {
    toast({
      title: "PDF Download",
      description: "PDF generation feature will be implemented soon",
    });
  };


  const refreshData = async () => {
    setIsLoading(true);
    setSyncProgress([]);
    
    const syncFunctions = [
      { name: 'Inventory', func: 'odoo-inventory' },
      { name: 'Products', func: 'odoo-products' },
      { name: 'Purchases', func: 'odoo-purchases' },
      { name: 'Invoices', func: 'odoo-invoices' },
      { name: 'Sales', func: 'odoo-sales' }
    ];

    toast({
      title: 'Refreshing Data',
      description: `Starting sync for ${syncFunctions.length} modules...`
    });

    try {
      // Track progress by updating state as each sync completes
      const syncResults = await Promise.all(
        syncFunctions.map(async (sync) => {
          try {
            const result = await supabase.functions.invoke(sync.func);
            setSyncProgress(prev => [...prev, sync.name]);
            return { name: sync.name, result, success: true };
          } catch (error) {
            setSyncProgress(prev => [...prev, `${sync.name} (Failed)`]);
            return { name: sync.name, result: { error }, success: false };
          }
        })
      );

      // Check results and provide detailed feedback
      const failedSyncs: string[] = [];
      const successfulSyncs: string[] = [];
      
      syncResults.forEach(({ name, result, success }) => {
        if (!success || result.error || (result.data && result.data.success === false)) {
          failedSyncs.push(name);
          console.error(`${name} sync failed:`, result.error || result.data?.error);
        } else {
          successfulSyncs.push(name);
        }
      });

      if (failedSyncs.length > 0) {
        toast({
          title: 'Partial Sync Error',
          description: `Failed: ${failedSyncs.join(', ')}. Successful: ${successfulSyncs.join(', ')}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Sync Complete',
          description: `All Odoo data synced successfully: ${successfulSyncs.join(', ')}`,
        });
      }
      
      // Reload both sales and purchase data to reflect changes
      await Promise.all([
        fetchSalesData(),
        fetchPurchaseData(),
        fetchSyncStatus()
      ]);
    } catch (error) {
      console.error('Refresh data error:', error);
      toast({
        title: 'Sync Error',
        description: error instanceof Error ? error.message : 'Failed to sync from Odoo',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setSyncProgress([]);
    }
  };

  const clearStuckSyncs = async () => {
    try {
      const { error } = await supabase
        .from('sync_status')
        .update({ status: 'failed', error_message: 'Manually cleared stuck sync' })
        .eq('status', 'running');

      if (error) {
        throw error;
      }

      toast({
        title: 'Sync Status Cleared',
        description: 'All stuck sync processes have been cleared'
      });

      await fetchSyncStatus();
    } catch (error) {
      console.error('Error clearing stuck syncs:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear stuck sync processes',
        variant: 'destructive'
      });
    }
  };

  const checkAutoSyncStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('auto-sync');
      
      if (error) {
        console.error('Auto-sync status check failed:', error);
        return;
      }

      setAutoSyncStatus(data);
    } catch (error) {
      console.error('Error checking auto-sync status:', error);
    }
  };

  const triggerAutoSync = async () => {
    try {
      setIsLoading(true);
      toast({
        title: 'Auto-Sync Triggered',
        description: 'Running scheduled auto-sync process...'
      });

      const { data, error } = await supabase.functions.invoke('auto-sync');
      
      if (error) {
        throw error;
      }

      if (data.success) {
        toast({
          title: 'Auto-Sync Complete',
          description: data.message || 'All sync operations completed successfully'
        });
      } else {
        toast({
          title: 'Auto-Sync Partial Success',
          description: data.message || 'Some sync operations had issues',
          variant: 'default'
        });
      }

      setAutoSyncStatus(data);
      await fetchSyncStatus();
    } catch (error) {
      console.error('Auto-sync trigger failed:', error);
      toast({
        title: 'Auto-Sync Error',
        description: error instanceof Error ? error.message : 'Failed to trigger auto-sync',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, onClick: () => navigate('/') },
    { id: 'scheduler', label: 'Production Scheduler', icon: Calendar, onClick: () => navigate('/') },
    { id: 'planner', label: 'Production Planner', icon: ClipboardList, onClick: () => navigate('/') },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3, onClick: () => {} },
    { id: 'inventory', label: 'Inventory', icon: Package, onClick: () => {} },
    { id: 'customers', label: 'Customers', icon: Users, onClick: () => {} },
    { id: 'settings', label: 'Settings', icon: Settings, onClick: () => {} },
  ];

  return (
    <div className="min-h-screen bg-white flex">
      {/* Modern Sidebar */}
      <div className="w-72 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl">
        <div className="p-8">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Flow Planner</h2>
              <p className="text-slate-300 text-sm">Production Suite</p>
            </div>
          </div>
        </div>
        <nav className="mt-4 px-4">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl text-left transition-all duration-300 mb-2 group ${
                item.id === 'reports' 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25' 
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <item.icon className={`h-5 w-5 transition-transform duration-300 ${
                item.id === 'reports' ? 'scale-110' : 'group-hover:scale-110'
              }`} />
              <span className="font-medium">{item.label}</span>
              {item.id === 'reports' && (
                <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50">
          <div className="container mx-auto p-8 space-y-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg">
                  <BarChart3 className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                    Reports & Analytics
                  </h1>
                  <p className="text-lg text-gray-600 mt-2">
                    Comprehensive business intelligence and reporting
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button 
                  onClick={() => setShowTargetsDialog(true)} 
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Set Targets
                </Button>
                <Button 
                  onClick={triggerAutoSync} 
                  disabled={isLoading} 
                  variant="outline"
                  className="bg-yellow-50 hover:bg-yellow-100 border-yellow-200 hover:border-yellow-300 text-yellow-700 hover:shadow-lg transition-all duration-300"
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Auto-Sync Now
                </Button>
                <Button 
                  onClick={refreshData} 
                  disabled={isLoading} 
                  variant="outline"
                  className="bg-white/80 hover:bg-white border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300"
                >
                  {isLoading ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {isLoading && syncProgress.length > 0 
                    ? `Syncing... (${syncProgress.length}/5)`
                    : isLoading 
                    ? 'Starting Sync...'
                    : 'Refresh Data'
                  }
                </Button>
              </div>
            </div>

            {/* Auto-Sync Status Panel */}
            {autoSyncStatus && (
              <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200 mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-yellow-800">
                    <Zap className="h-5 w-5" />
                    <span>Auto-Sync Status (2-Hour Intervals)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-700">
                        {autoSyncStatus.configuration?.enabled ? 'Enabled' : 'Disabled'}
                      </div>
                      <div className="text-sm text-yellow-600">Auto-Sync Status</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-700">
                        {autoSyncStatus.configuration?.intervalMinutes || 120} min
                      </div>
                      <div className="text-sm text-yellow-600">Sync Interval</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-700">
                        {autoSyncStatus.nextSyncDue ? 
                          new Date(autoSyncStatus.nextSyncDue).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
                          'N/A'
                        }
                      </div>
                      <div className="text-sm text-yellow-600">Next Sync</div>
                    </div>
                  </div>
                  {autoSyncStatus.syncResults && autoSyncStatus.syncResults.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-yellow-200">
                      <div className="text-sm text-yellow-700 mb-2">Last Auto-Sync Results:</div>
                      <div className="flex flex-wrap gap-2">
                        {autoSyncStatus.syncResults.map((result: any, index: number) => (
                          <span 
                            key={index}
                            className={`px-2 py-1 rounded text-xs ${
                              result.success 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {result.syncType}: {result.success ? '✓' : '✗'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Sync Status Panel */}
            {syncStatus.length > 0 && (
              <Card className="bg-white/80 backdrop-blur-sm mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Clock className="h-5 w-5" />
                      <span>Sync Status</span>
                    </div>
                    {syncStatus.some(status => status.status === 'running') && (
                      <Button
                        onClick={clearStuckSyncs}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Clear Stuck
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {syncStatus.slice(0, 5).map((status, index) => {
                      const getStatusIcon = () => {
                        switch (status.status) {
                          case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
                          case 'completed_with_errors': return <AlertCircle className="h-4 w-4 text-yellow-600" />;
                          case 'failed': return <XCircle className="h-4 w-4 text-red-600" />;
                          case 'running': return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
                          default: return <Clock className="h-4 w-4 text-gray-600" />;
                        }
                      };

                      const getStatusColor = () => {
                        switch (status.status) {
                          case 'completed': return 'border-green-200 bg-green-50';
                          case 'completed_with_errors': return 'border-yellow-200 bg-yellow-50';
                          case 'failed': return 'border-red-200 bg-red-50';
                          case 'running': return 'border-blue-200 bg-blue-50';
                          default: return 'border-gray-200 bg-gray-50';
                        }
                      };

                      return (
                        <div key={index} className={`p-3 rounded-lg border ${getStatusColor()}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium capitalize text-sm">{status.sync_type}</span>
                            {getStatusIcon()}
                          </div>
                          <div className="text-xs text-gray-600">
                            <div>Records: {status.synced_records || 0}/{status.total_records || 0}</div>
                            <div>
                              {status.last_sync_timestamp 
                                ? new Date(status.last_sync_timestamp).toLocaleString()
                                : 'Never'
                              }
                            </div>
                            {status.failed_records > 0 && (
                              <div className="text-red-600">Failed: {status.failed_records}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <Tabs defaultValue="reports" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-white/80 backdrop-blur-sm">
                <TabsTrigger value="reports" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white">
                  Analytics Reports
                </TabsTrigger>
                <TabsTrigger value="targets" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white">
                  Saved Targets
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="reports" className="space-y-8 mt-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {/* Sales Analytics Report */}
                  <Card className="group cursor-pointer border-0 bg-white/80 backdrop-blur-sm hover:bg-white hover:shadow-2xl hover:shadow-black/10 transition-all duration-300 hover:-translate-y-1 overflow-hidden" onClick={() => openDialog('sales')}>
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <CardHeader className="relative">
                      <CardTitle className="flex items-center space-x-3">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg">
                          <BarChart3 className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-xl font-bold">Sales Analytics</span>
                      </CardTitle>
                      <CardDescription className="text-base">
                        Comprehensive sales analysis with quantity trends, customer insights, and year-over-year comparisons
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Total Invoices:</span>
                          <span className="font-semibold">{salesData.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Total Value:</span>
                          <span className="font-semibold">
                            LKR {salesData.reduce((sum, item) => sum + item.amount_total, 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Active Customers:</span>
                          <span className="font-semibold">
                            {new Set(salesData.map(item => item.partner_name)).size}
                          </span>
                        </div>
                      </div>
                      <Button 
                        className="w-full mt-6 bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300" 
                        onClick={(e) => { e.stopPropagation(); openDialog('sales'); }}
                      >
                        View Report
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Advanced Inventory Report */}
                  <Card className="group cursor-pointer border-0 bg-white/80 backdrop-blur-sm hover:bg-white hover:shadow-2xl hover:shadow-black/10 transition-all duration-300 hover:-translate-y-1 overflow-hidden" onClick={() => openDialog('inventory')}>
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <CardHeader className="relative">
                      <CardTitle className="flex items-center space-x-3">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg">
                          <Package className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-xl font-bold">Inventory Report</span>
                      </CardTitle>
                      <CardDescription className="text-base">
                        Pivot-style inventory analysis with supplier tracking, purchase planning, and demand forecasting
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Categories:</span>
                          <span className="font-semibold">Multiple</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Planning Mode:</span>
                          <span className="font-semibold text-blue-600">Advanced</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Supplier Integration:</span>
                          <span className="font-semibold text-green-600">Active</span>
                        </div>
                      </div>
                      <Button 
                        className="w-full mt-6 bg-gradient-to-r from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300" 
                        onClick={(e) => { e.stopPropagation(); openDialog('inventory'); }}
                      >
                        View Report
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Purchase Analytics Report */}
                  <Card className="group cursor-pointer border-0 bg-white/80 backdrop-blur-sm hover:bg-white hover:shadow-2xl hover:shadow-black/10 transition-all duration-300 hover:-translate-y-1 overflow-hidden" onClick={() => openDialog('purchase')}>
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <CardHeader className="relative">
                      <CardTitle className="flex items-center space-x-3">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 shadow-lg">
                          <FileText className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-xl font-bold">Purchase Analytics</span>
                      </CardTitle>
                      <CardDescription className="text-base">
                        Purchase order analysis, supplier performance, and procurement insights
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Total POs:</span>
                          <span className="font-semibold">{purchaseData.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Total Value:</span>
                          <span className="font-semibold">
                            LKR {purchaseData.reduce((sum, item) => sum + item.amount_total, 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Suppliers:</span>
                          <span className="font-semibold">
                            {new Set(purchaseData.map(item => item.partner_name)).size}
                          </span>
                        </div>
                      </div>
                      <Button 
                        className="w-full mt-6 bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300" 
                        onClick={(e) => { e.stopPropagation(); openDialog('purchase'); }}
                      >
                        View Report
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              
              <TabsContent value="targets" className="space-y-8 mt-8">
                <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 border border-white/20 shadow-lg">
                  <SavedTargetsManager />
                </div>
              </TabsContent>
            </Tabs>

            {/* Report Dialogs */}
            <ReportDialog
              isOpen={activeDialog === 'sales'}
              onClose={closeDialog}
              title="Sales Analytics Report"
              onDownloadPdf={handleDownloadPdf}
              downloadButtonText="Download Sales PDF"
            >
              <SalesReportContent salesData={salesData} />
            </ReportDialog>

            <ReportDialog
              isOpen={activeDialog === 'inventory'}
              onClose={closeDialog}
              title="Advanced Inventory Planning Report"
              onDownloadPdf={handleDownloadPdf}
              downloadButtonText="Download Inventory PDF"
            >
              <AdvancedInventoryReport />
            </ReportDialog>

            <ReportDialog
              isOpen={activeDialog === 'purchase'}
              onClose={closeDialog}
              title="Purchase Analytics Report"
              onDownloadPdf={handleDownloadPdf}
              downloadButtonText="Download Purchase PDF"
            >
              <div className="p-4">
                <h3 className="text-lg font-semibold mb-4">Purchase Analytics</h3>
                <p className="text-muted-foreground">Purchase analytics dashboard will be implemented next.</p>
                
                <div className="mt-6">
                  <h4 className="font-medium mb-2">Recent Purchase Orders:</h4>
                  <div className="space-y-2">
                    {purchaseData.map((purchase, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <div>
                          <div className="font-medium">{purchase.name}</div>
                          <div className="text-sm text-muted-foreground">{purchase.partner_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">LKR {purchase.amount_total.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">{purchase.date_order}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ReportDialog>

            {/* Sales Target Dialog */}
            <SalesTargetDialog
              isOpen={showTargetsDialog}
              onClose={() => setShowTargetsDialog(false)}
              salesData={salesData}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
