
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Database, Download, RefreshCw, Settings, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SaleData {
  id: string;
  name: string;
  partner_name: string;
  date_order: string;
  amount_total: number;
  state: string;
}

interface PurchaseData {
  id: string;
  name: string;
  partner_name: string;
  date_order: string;
  amount_total: number;
  state: string;
}

const OdooIntegration: React.FC = () => {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saleData, setSaleData] = useState<SaleData[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseData[]>([]);

  const testConnection = async () => {
    setIsLoading(true);
    try {
      console.log('Testing Odoo connection...');
      
      const { data, error } = await supabase.functions.invoke('odoo-auth');
      
      if (error) {
        throw new Error(`Connection error: ${error.message}`);
      }

      if (data.success) {
        setIsConnected(true);
        toast({
          title: "Connection Successful",
          description: "Successfully connected to your Odoo server",
        });
      } else {
        throw new Error(data.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      setIsConnected(false);
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect to Odoo server",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSaleData = async () => {
    if (!isConnected) {
      toast({
        title: "Not Connected",
        description: "Please test connection first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log('Fetching sales data from Odoo...');
      
      const { data, error } = await supabase.functions.invoke('odoo-sales');
      
      if (error) {
        throw new Error(`Failed to fetch sales data: ${error.message}`);
      }

      if (data.success) {
        setSaleData(data.data);
        toast({
          title: "Sales Data Fetched",
          description: `Retrieved ${data.count} sale orders from your Odoo server`,
        });
      } else {
        throw new Error(data.error || 'Failed to fetch sales data');
      }
    } catch (error) {
      console.error('Sales data fetch failed:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch sales data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPurchaseData = async () => {
    if (!isConnected) {
      toast({
        title: "Not Connected",
        description: "Please test connection first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log('Fetching purchase data from Odoo...');
      
      const { data, error } = await supabase.functions.invoke('odoo-purchases');
      
      if (error) {
        throw new Error(`Failed to fetch purchase data: ${error.message}`);
      }

      if (data.success) {
        setPurchaseData(data.data);
        toast({
          title: "Purchase Data Fetched",
          description: `Retrieved ${data.count} purchase orders from your Odoo server`,
        });
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

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast({
        title: "No Data",
        description: "No data available to export",
        variant: "destructive",
      });
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export Successful",
      description: `${filename}.csv has been downloaded`,
    });
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'sale':
      case 'purchase':
        return 'bg-green-100 text-green-800';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancel':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-2 mb-6">
        <Database className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold">Odoo Integration</h1>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Odoo Server Status</span>
            {isConnected ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600" />
            )}
          </CardTitle>
          <CardDescription>
            Your Odoo server connection status and controls
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <Badge variant={isConnected ? "default" : "secondary"}>
              {isConnected ? "Connected" : "Not Connected"}
            </Badge>
            <Button 
              onClick={testConnection} 
              disabled={isLoading}
              variant={isConnected ? "outline" : "default"}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Test Connection
                </>
              )}
            </Button>
          </div>
          {isConnected && (
            <p className="text-sm text-green-600 mt-2">
              ✅ Connected to your Odoo server successfully
            </p>
          )}
        </CardContent>
      </Card>

      {/* Data Extraction */}
      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sales">Sales Data</TabsTrigger>
          <TabsTrigger value="purchases">Purchase Data</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sales Orders</CardTitle>
              <CardDescription>
                Extract and view sales order data from your Odoo server
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-2 mb-4">
                <Button onClick={fetchSaleData} disabled={isLoading || !isConnected}>
                  {isLoading ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Fetch Sales Data
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => exportToCSV(saleData, 'odoo_sales_data')}
                  disabled={saleData.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>

              {saleData.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left">Order ID</th>
                          <th className="px-4 py-2 text-left">Name</th>
                          <th className="px-4 py-2 text-left">Customer</th>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                          <th className="px-4 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saleData.map((sale) => (
                          <tr key={sale.id} className="border-t">
                            <td className="px-4 py-2 font-mono">{sale.id}</td>
                            <td className="px-4 py-2">{sale.name}</td>
                            <td className="px-4 py-2">{sale.partner_name}</td>
                            <td className="px-4 py-2">{sale.date_order}</td>
                            <td className="px-4 py-2 text-right">${sale.amount_total.toLocaleString()}</td>
                            <td className="px-4 py-2 text-center">
                              <Badge className={getStateColor(sale.state)}>
                                {sale.state}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Orders</CardTitle>
              <CardDescription>
                Extract and view purchase order data from your Odoo server
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-2 mb-4">
                <Button onClick={fetchPurchaseData} disabled={isLoading || !isConnected}>
                  {isLoading ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Fetch Purchase Data
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => exportToCSV(purchaseData, 'odoo_purchase_data')}
                  disabled={purchaseData.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>

              {purchaseData.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left">Order ID</th>
                          <th className="px-4 py-2 text-left">Name</th>
                          <th className="px-4 py-2 text-left">Supplier</th>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                          <th className="px-4 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseData.map((purchase) => (
                          <tr key={purchase.id} className="border-t">
                            <td className="px-4 py-2 font-mono">{purchase.id}</td>
                            <td className="px-4 py-2">{purchase.name}</td>
                            <td className="px-4 py-2">{purchase.partner_name}</td>
                            <td className="px-4 py-2">{purchase.date_order}</td>
                            <td className="px-4 py-2 text-right">${purchase.amount_total.toLocaleString()}</td>
                            <td className="px-4 py-2 text-center">
                              <Badge className={getStateColor(purchase.state)}>
                                {purchase.state}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OdooIntegration;
