import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReportDialog } from '@/components/reports/ReportDialog';
import { SalesReportContent } from '@/components/reports/SalesReportContent';
import { InventoryReportContent } from '@/components/reports/InventoryReportContent';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { FileText, BarChart3, Package, Download, RefreshCw, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
}

const Reports: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeDialog, setActiveDialog] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseData[]>([]);

  const fetchSalesData = async () => {
    setIsLoading(true);
    try {
      // First try to get data from local Supabase database
      const { data: localData, error: localError } = await supabase
        .from('invoices')
        .select('*')
        .order('date_order', { ascending: false });

      if (!localError && localData && localData.length > 0) {
        console.log('Using local invoice data:', localData.length, 'records');
        
        // Transform the data to match our SalesData interface
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
        setIsLoading(false);
        return;
      }

      // If no local data, fetch from Odoo and sync
      console.log('Fetching fresh data from Odoo...');
      const { data, error } = await supabase.functions.invoke('odoo-invoices');
      
      if (error) {
        throw new Error(`Failed to fetch invoice data: ${error.message}`);
      }

      if (data.success) {
        setSalesData(data.data);
        console.log('Invoice data loaded:', data.data.length, 'records');
        toast({
          title: "Data Synced",
          description: `${data.synced_to_supabase || data.data.length} invoices synced to database`,
        });
      } else {
        throw new Error(data.error || 'Failed to fetch invoice data');
      }
    } catch (error) {
      console.error('Invoice data fetch failed:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch invoice data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPurchaseData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('odoo-purchases');
      
      if (error) {
        throw new Error(`Failed to fetch purchase data: ${error.message}`);
      }

      if (data.success) {
        setPurchaseData(data.data);
        console.log('Purchase data loaded:', data.data.length, 'records');
      } else {
        throw new Error(data.error || 'Failed to fetch purchase data');
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

  useEffect(() => {
    fetchSalesData();
    fetchPurchaseData();
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
    // Force refresh from Odoo
    const { data, error } = await supabase.functions.invoke('odoo-invoices');
    
    if (!error && data.success) {
      setSalesData(data.data);
      toast({
        title: "Data Refreshed",
        description: `${data.synced_to_supabase || data.data.length} invoices synced from Odoo`,
      });
    }
    
    await fetchPurchaseData();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>
          <div className="flex items-center space-x-2">
            <FileText className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold">Odoo Reports & Analytics</h1>
          </div>
        </div>
        <Button onClick={refreshData} disabled={isLoading} variant="outline">
          {isLoading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh Data
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Sales Analytics Report */}
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => openDialog('sales')}>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="h-6 w-6 text-blue-600" />
              <span>Sales Analytics Report</span>
            </CardTitle>
            <CardDescription>
              Comprehensive sales analysis with quantity trends, customer insights, and year-over-year comparisons
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
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
            <Button className="w-full mt-4" onClick={(e) => { e.stopPropagation(); openDialog('sales'); }}>
              View Report
            </Button>
          </CardContent>
        </Card>

        {/* Inventory Report */}
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => openDialog('inventory')}>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Package className="h-6 w-6 text-green-600" />
              <span>Inventory Report</span>
            </CardTitle>
            <CardDescription>
              Stock levels, inventory movements, and product category analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Categories:</span>
                <span className="font-semibold">8</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Products:</span>
                <span className="font-semibold">245</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Low Stock Items:</span>
                <span className="font-semibold text-red-600">12</span>
              </div>
            </div>
            <Button className="w-full mt-4" onClick={(e) => { e.stopPropagation(); openDialog('inventory'); }}>
              View Report
            </Button>
          </CardContent>
        </Card>

        {/* Purchase Analytics Report */}
        <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => openDialog('purchase')}>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-6 w-6 text-purple-600" />
              <span>Purchase Analytics</span>
            </CardTitle>
            <CardDescription>
              Purchase order analysis, supplier performance, and procurement insights
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
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
            <Button className="w-full mt-4" onClick={(e) => { e.stopPropagation(); openDialog('purchase'); }}>
              View Report
            </Button>
          </CardContent>
        </Card>
      </div>

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
        title="Product Inventory Report"
        onDownloadPdf={handleDownloadPdf}
        downloadButtonText="Download Inventory PDF"
      >
        <InventoryReportContent inventoryData={[]} purchaseData={purchaseData} />
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
              {purchaseData.slice(0, 10).map((purchase, index) => (
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
    </div>
  );
};

export default Reports;
