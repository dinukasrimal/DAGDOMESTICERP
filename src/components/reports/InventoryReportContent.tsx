
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Package, AlertTriangle, TrendingUp, Warehouse } from 'lucide-react';

interface InventoryData {
  product_name: string;
  product_category: string;
  quantity_on_hand: number;
  quantity_available: number;
  incoming_qty: number;
  outgoing_qty: number;
  virtual_available: number;
  reorder_min: number;
  reorder_max: number;
  cost: number;
  location: string;
}

interface InventoryReportContentProps {
  inventoryData: InventoryData[];
  purchaseData: any[];
}

export const InventoryReportContent: React.FC<InventoryReportContentProps> = ({ 
  inventoryData, 
  purchaseData 
}) => {
  const [selectedYear, setSelectedYear] = useState('2024');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Mock inventory data with correct product categories
  const mockInventoryData: InventoryData[] = [
    {
      product_name: "SOLACE MENS BRIEF",
      product_category: "SOLACE",
      quantity_on_hand: 764,
      quantity_available: 774,
      incoming_qty: 253,
      outgoing_qty: 10,
      virtual_available: 1017,
      reorder_min: 100,
      reorder_max: 1000,
      cost: 3825.50,
      location: "WH/Stock"
    },
    {
      product_name: "DELI BOXER SHORTS",
      product_category: "DELI",
      quantity_on_hand: 18816,
      quantity_available: 10597,
      incoming_qty: 1204,
      outgoing_qty: 10807,
      virtual_available: 20200,
      reorder_min: 5000,
      reorder_max: 25000,
      cost: 2362.75,
      location: "WH/Stock"
    },
    {
      product_name: "FEER COTTON VEST",
      product_category: "FEER", 
      quantity_on_hand: 288,
      quantity_available: 398,
      incoming_qty: 110,
      outgoing_qty: 0,
      virtual_available: 288,
      reorder_min: 100,
      reorder_max: 500,
      cost: 2730.20,
      location: "WH/Stock"
    },
    {
      product_name: "BOXER PREMIUM PACK",
      product_category: "BOXER",
      quantity_on_hand: 293,
      quantity_available: 204,
      incoming_qty: 30,
      outgoing_qty: 130,
      virtual_available: 304,
      reorder_min: 50,
      reorder_max: 400,
      cost: 2520.80,
      location: "WH/Stock"
    },
    {
      product_name: "SOLACE LADIES BRIEF",
      product_category: "SOLACE",
      quantity_on_hand: 635,
      quantity_available: 158,
      incoming_qty: 0,
      outgoing_qty: 517,
      virtual_available: 675,
      reorder_min: 200,
      reorder_max: 800,
      cost: 2145.30,
      location: "WH/Stock"
    },
    {
      product_name: "DELI COTTON PANTY",
      product_category: "DELI",
      quantity_on_hand: 1250,
      quantity_available: 980,
      incoming_qty: 200,
      outgoing_qty: 470,
      virtual_available: 1180,
      reorder_min: 300,
      reorder_max: 1500,
      cost: 1890.75,
      location: "WH/Stock"
    },
    {
      product_name: "FEER SPORTS BRA",
      product_category: "FEER",
      quantity_on_hand: 420,
      quantity_available: 350,
      incoming_qty: 80,
      outgoing_qty: 150,
      virtual_available: 500,
      reorder_min: 100,
      reorder_max: 600,
      cost: 4250.90,
      location: "WH/Stock"
    },
    {
      product_name: "BOXER KIDS BRIEF",
      product_category: "BOXER",
      quantity_on_hand: 890,
      quantity_available: 720,
      incoming_qty: 150,
      outgoing_qty: 320,
      virtual_available: 1040,
      reorder_min: 200,
      reorder_max: 1000,
      cost: 1675.40,
      location: "WH/Stock"
    }
  ];

  const workingInventoryData = inventoryData.length > 0 ? inventoryData : mockInventoryData;

  // Get unique categories
  const categories = [...new Set(workingInventoryData.map(item => item.product_category))].sort();

  // Filter data
  const filteredData = workingInventoryData.filter(item => {
    if (selectedCategory !== 'all' && item.product_category !== selectedCategory) return false;
    return true;
  });

  // Category summary for chart
  const categoryData = categories.map(category => {
    const categoryItems = filteredData.filter(item => item.product_category === category);
    const totalQuantity = categoryItems.reduce((sum, item) => sum + item.quantity_on_hand, 0);
    const totalValue = categoryItems.reduce((sum, item) => sum + (item.quantity_on_hand * item.cost), 0);
    
    return {
      category: category.length > 12 ? category.substring(0, 12) + '...' : category,
      quantity: totalQuantity,
      value: totalValue,
      items: categoryItems.length
    };
  }).sort((a, b) => b.quantity - a.quantity);

  // Calculate totals
  const totalQuantity = filteredData.reduce((sum, item) => sum + item.quantity_on_hand, 0);
  const totalIncoming = filteredData.reduce((sum, item) => sum + item.incoming_qty, 0);
  const totalOutgoing = filteredData.reduce((sum, item) => sum + item.outgoing_qty, 0);
  const totalValue = filteredData.reduce((sum, item) => sum + (item.quantity_on_hand * item.cost), 0);

  // Low stock items
  const lowStockItems = filteredData.filter(item => 
    item.quantity_available < item.reorder_min
  );

  const chartConfig = {
    quantity: {
      label: "Quantity",
      color: "hsl(var(--chart-1))",
    },
    value: {
      label: "Value",
      color: "hsl(var(--chart-2))",
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">Product Inventory Report</h1>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter:</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Month</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Multiple select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {Array.from({length: 12}, (_, i) => (
                    <SelectItem key={i+1} value={(i+1).toString()}>
                      {new Date(2000, i).toLocaleDateString('en-US', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">PRODUCT CAT...</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Stock</p>
                <p className="text-2xl font-bold">{totalQuantity.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Incoming</p>
                <p className="text-2xl font-bold text-green-600">{totalIncoming.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Warehouse className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Outgoing</p>
                <p className="text-2xl font-bold text-orange-600">{totalOutgoing.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Low Stock</p>
                <p className="text-2xl font-bold text-red-600">{lowStockItems.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory by Category Chart */}
        <Card>
          <CardHeader>
            <CardTitle>(Inventory-Sale)By Product Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="category" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="quantity" fill="var(--color-quantity)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Detailed Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredData.map((item, index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{item.product_name}</div>
                    <div className="text-xs text-muted-foreground">{item.product_category}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{item.quantity_on_hand}</div>
                    <div className="text-xs text-muted-foreground">
                      In: {item.incoming_qty} | Out: {item.outgoing_qty}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">PRODUCT CATEGORY</th>
                  <th className="border p-2 text-right">Quantity</th>
                  <th className="border p-2 text-right">Incoming</th>
                  <th className="border p-2 text-right">Outgoing</th>
                  <th className="border p-2 text-right">STOCK WITHOUT INCOMING</th>
                  <th className="border p-2 text-right">Inventory</th>
                  <th className="border p-2 text-right">NEEDS PLANNING</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="border p-2">{item.product_name}</td>
                    <td className="border p-2 text-right">{item.quantity_on_hand}</td>
                    <td className="border p-2 text-right">{item.incoming_qty}</td>
                    <td className="border p-2 text-right">{item.outgoing_qty}</td>
                    <td className="border p-2 text-right">{item.quantity_available}</td>
                    <td className="border p-2 text-right">{item.virtual_available}</td>
                    <td className="border p-2 text-right">
                      <span className={item.quantity_available < item.reorder_min ? 'text-red-600 font-bold' : ''}>
                        {Math.max(0, item.reorder_min - item.quantity_available)}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-bold">
                  <td className="border p-2">Total</td>
                  <td className="border p-2 text-right">{totalQuantity}</td>
                  <td className="border p-2 text-right">{totalIncoming}</td>
                  <td className="border p-2 text-right">{totalOutgoing}</td>
                  <td className="border p-2 text-right">
                    {filteredData.reduce((sum, item) => sum + item.quantity_available, 0)}
                  </td>
                  <td className="border p-2 text-right">
                    {filteredData.reduce((sum, item) => sum + item.virtual_available, 0)}
                  </td>
                  <td className="border p-2 text-right">
                    {filteredData.reduce((sum, item) => sum + Math.max(0, item.reorder_min - item.quantity_available), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
