
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Database, Download, RefreshCw, Settings, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OdooConfig {
  url: string;
  database: string;
  username: string;
  password: string;
}

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
  const [config, setConfig] = useState<OdooConfig>({
    url: '',
    database: '',
    username: '',
    password: ''
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saleData, setSaleData] = useState<SaleData[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseData[]>([]);

  const handleConfigChange = (field: keyof OdooConfig, value: string) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const testConnection = async () => {
    setIsLoading(true);
    try {
      // Simulate connection test
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!config.url || !config.database || !config.username || !config.password) {
        throw new Error('Please fill in all configuration fields');
      }
      
      setIsConnected(true);
      toast({
        title: "Connection Successful",
        description: "Successfully connected to Odoo instance",
      });
    } catch (error) {
      setIsConnected(false);
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect to Odoo",
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
        description: "Please establish connection first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Simulate API call to fetch sale data
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockSaleData: SaleData[] = [
        {
          id: "SO001",
          name: "Sale Order 001",
          partner_name: "Customer ABC",
          date_order: "2024-01-15",
          amount_total: 15000,
          state: "sale"
        },
        {
          id: "SO002",
          name: "Sale Order 002",
          partner_name: "Customer XYZ",
          date_order: "2024-01-16",
          amount_total: 25000,
          state: "draft"
        }
      ];
      
      setSaleData(mockSaleData);
      toast({
        title: "Sale Data Fetched",
        description: `Retrieved ${mockSaleData.length} sale orders`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch sale data from Odoo",
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
        description: "Please establish connection first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Simulate API call to fetch purchase data
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockPurchaseData: PurchaseData[] = [
        {
          id: "PO001",
          name: "Purchase Order 001",
          partner_name: "Supplier ABC",
          date_order: "2024-01-10",
          amount_total: 8000,
          state: "purchase"
        },
        {
          id: "PO002",
          name: "Purchase Order 002",
          partner_name: "Supplier XYZ",
          date_order: "2024-01-12",
          amount_total: 12000,
          state: "draft"
        }
      ];
      
      setPurchaseData(mockPurchaseData);
      toast({
        title: "Purchase Data Fetched",
        description: `Retrieved ${mockPurchaseData.length} purchase orders`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch purchase data from Odoo",
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

      {/* Connection Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Odoo Configuration</span>
            {isConnected ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600" />
            )}
          </CardTitle>
          <CardDescription>
            Configure your Odoo instance connection settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="url">Odoo URL</Label>
              <Input
                id="url"
                placeholder="https://your-odoo-instance.com"
                value={config.url}
                onChange={(e) => handleConfigChange('url', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="database">Database Name</Label>
              <Input
                id="database"
                placeholder="your-database-name"
                value={config.database}
                onChange={(e) => handleConfigChange('database', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="your-username"
                value={config.username}
                onChange={(e) => handleConfigChange('username', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="your-password"
                value={config.password}
                onChange={(e) => handleConfigChange('password', e.target.value)}
              />
            </div>
          </div>
          <Button 
            onClick={testConnection} 
            disabled={isLoading}
            className="w-full md:w-auto"
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
                Extract and view sales order data from your Odoo instance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-2 mb-4">
                <Button onClick={fetchSaleData} disabled={isLoading}>
                  {isLoading ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Fetch Sale Data
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => exportToCSV(saleData, 'sales_data')}
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
                Extract and view purchase order data from your Odoo instance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-2 mb-4">
                <Button onClick={fetchPurchaseData} disabled={isLoading}>
                  {isLoading ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Fetch Purchase Data
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => exportToCSV(purchaseData, 'purchase_data')}
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
