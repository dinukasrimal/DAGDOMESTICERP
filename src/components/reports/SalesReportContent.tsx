
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Package } from 'lucide-react';

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

interface SalesReportContentProps {
  salesData: SalesData[];
}

export const SalesReportContent: React.FC<SalesReportContentProps> = ({ salesData }) => {
  const [selectedYear, setSelectedYear] = useState('2025');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [showValues, setShowValues] = useState(false);

  // Get available years from data
  const availableYears = [...new Set(salesData.map(item => 
    new Date(item.date_order).getFullYear().toString()
  ))].sort((a, b) => b.localeCompare(a));

  // Filter data based on selections
  const filteredData = salesData.filter(item => {
    const orderDate = new Date(item.date_order);
    const year = orderDate.getFullYear().toString();
    const month = orderDate.getMonth() + 1;
    
    if (selectedYear !== 'all' && year !== selectedYear) return false;
    if (selectedMonth !== 'all' && month.toString() !== selectedMonth) return false;
    if (selectedCustomer !== 'all' && item.partner_name !== selectedCustomer) return false;
    
    return true;
  });

  // Calculate total quantity and value
  const totalQuantity = filteredData.reduce((sum, item) => {
    return sum + (item.order_lines?.reduce((lineSum, line) => lineSum + line.qty_delivered, 0) || 1);
  }, 0);

  const totalValue = filteredData.reduce((sum, item) => sum + item.amount_total, 0);

  // Previous year comparison
  const previousYear = (parseInt(selectedYear) - 1).toString();
  const previousYearData = salesData.filter(item => {
    const orderDate = new Date(item.date_order);
    const year = orderDate.getFullYear().toString();
    const month = orderDate.getMonth() + 1;
    
    if (year !== previousYear) return false;
    if (selectedMonth !== 'all' && month.toString() !== selectedMonth) return false;
    if (selectedCustomer !== 'all' && item.partner_name !== selectedCustomer) return false;
    
    return true;
  });

  const previousYearQuantity = previousYearData.reduce((sum, item) => {
    return sum + (item.order_lines?.reduce((lineSum, line) => lineSum + line.qty_delivered, 0) || 1);
  }, 0);

  const previousYearValue = previousYearData.reduce((sum, item) => sum + item.amount_total, 0);

  const quantityGrowth = previousYearQuantity > 0 
    ? ((totalQuantity - previousYearQuantity) / previousYearQuantity * 100).toFixed(1)
    : '0';

  const valueGrowth = previousYearValue > 0 
    ? ((totalValue - previousYearValue) / previousYearValue * 100).toFixed(1)
    : '0';

  // Customer data aggregation with previous year
  const customerData = filteredData.reduce((acc, item) => {
    const customer = item.partner_name;
    if (!acc[customer]) {
      acc[customer] = { quantity: 0, value: 0 };
    }
    acc[customer].quantity += item.order_lines?.reduce((sum, line) => sum + line.qty_delivered, 0) || 1;
    acc[customer].value += item.amount_total;
    return acc;
  }, {} as Record<string, { quantity: number; value: number }>);

  const customerPreviousData = previousYearData.reduce((acc, item) => {
    const customer = item.partner_name;
    if (!acc[customer]) {
      acc[customer] = { quantity: 0, value: 0 };
    }
    acc[customer].quantity += item.order_lines?.reduce((sum, line) => sum + line.qty_delivered, 0) || 1;
    acc[customer].value += item.amount_total;
    return acc;
  }, {} as Record<string, { quantity: number; value: number }>);

  const customerChartData = Object.entries(customerData)
    .map(([customer, data]) => ({
      customer: customer.length > 15 ? customer.substring(0, 15) + '...' : customer,
      current: showValues ? data.value : data.quantity,
      previous: showValues ? (customerPreviousData[customer]?.value || 0) : (customerPreviousData[customer]?.quantity || 0),
      avgPrice: Math.round(data.value / data.quantity)
    }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 10);

  // Monthly data aggregation
  const monthlyData = filteredData.reduce((acc, item) => {
    const date = new Date(item.date_order);
    const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
    if (!acc[monthKey]) {
      acc[monthKey] = { quantity: 0, value: 0 };
    }
    acc[monthKey].quantity += item.order_lines?.reduce((sum, line) => sum + line.qty_delivered, 0) || 1;
    acc[monthKey].value += item.amount_total;
    return acc;
  }, {} as Record<string, { quantity: number; value: number }>);

  const monthlyPreviousData = previousYearData.reduce((acc, item) => {
    const date = new Date(item.date_order);
    const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
    if (!acc[monthKey]) {
      acc[monthKey] = { quantity: 0, value: 0 };
    }
    acc[monthKey].quantity += item.order_lines?.reduce((sum, line) => sum + line.qty_delivered, 0) || 1;
    acc[monthKey].value += item.amount_total;
    return acc;
  }, {} as Record<string, { quantity: number; value: number }>);

  const monthlyChartData = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    .map(month => ({
      month,
      current: showValues ? (monthlyData[month]?.value || 0) : (monthlyData[month]?.quantity || 0),
      previous: showValues ? (monthlyPreviousData[month]?.value || 0) : (monthlyPreviousData[month]?.quantity || 0),
      variance: 0
    }));

  // Get unique customers for filter
  const customers = [...new Set(salesData.map(item => item.partner_name))].sort();

  const chartConfig = {
    current: {
      label: `Current Year (${selectedYear})`,
      color: "hsl(var(--chart-1))",
    },
    previous: {
      label: `Previous Year (${previousYear})`,
      color: "hsl(var(--chart-2))",
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter:</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
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
              <label className="text-sm font-medium mb-2 block">Customer</label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Multiple select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map(customer => (
                    <SelectItem key={customer} value={customer}>{customer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Display</label>
              <Button 
                onClick={() => setShowValues(!showValues)}
                variant={showValues ? "default" : "outline"}
                className="w-full"
              >
                {showValues ? "Values (LKR)" : "Quantity"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold">
            Sales Report By {showValues ? "Value" : "Quantity"}
          </CardTitle>
          <div className="flex justify-center items-center space-x-8 mt-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{selectedYear}</div>
              <div className="text-sm text-muted-foreground">vs</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{previousYear}</div>
            </div>
          </div>
          <div className="text-center mt-4">
            <div className="text-4xl font-bold text-blue-600">
              {showValues ? `LKR ${totalValue.toLocaleString()}` : `${totalQuantity.toLocaleString()}`}
            </div>
            <div className="flex items-center justify-center mt-2">
              <span className="text-sm mr-2">
                Previous Year: {showValues ? `LKR ${previousYearValue.toLocaleString()}` : `${previousYearQuantity.toLocaleString()}`}
              </span>
              <div className="flex items-center">
                {parseFloat(showValues ? valueGrowth : quantityGrowth) > 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                )}
                <span className={`text-sm font-medium ${
                  parseFloat(showValues ? valueGrowth : quantityGrowth) > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {showValues ? valueGrowth : quantityGrowth}%
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{showValues ? "Value" : "Qty"} by Customer</CardTitle>
            <Badge variant="outline">{selectedYear}</Badge>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={customerChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="customer" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="current" fill="var(--color-current)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Year over Year Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Current vs Previous Year {showValues ? "Value" : "Quantity"} By Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={customerChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="customer" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="current" fill="var(--color-current)" />
                  <Bar dataKey="previous" fill="var(--color-previous)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Monthly Trends */}
        <Card>
          <CardHeader>
            <CardTitle>{showValues ? "Value" : "Qty"} by Month</CardTitle>
            <Badge variant="outline">{selectedYear}</Badge>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="current" fill="var(--color-current)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Monthly Comparison with Previous Year */}
        <Card>
          <CardHeader>
            <CardTitle>Current vs Previous Year {showValues ? "Value" : "Quantity"} By Month</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="current" fill="var(--color-current)" />
                  <Bar dataKey="previous" fill="var(--color-previous)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
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
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">Year</th>
                  <th className="border p-2 text-left">Month</th>
                  <th className="border p-2 text-left">Customer</th>
                  <th className="border p-2 text-right">Quantity</th>
                  <th className="border p-2 text-right">Value (LKR)</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.slice(0, 20).map((item, index) => {
                  const date = new Date(item.date_order);
                  const quantity = item.order_lines?.reduce((sum, line) => sum + line.qty_delivered, 0) || 1;
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border p-2">{date.getFullYear()}</td>
                      <td className="border p-2">{date.toLocaleDateString('en-US', { month: 'short' })}</td>
                      <td className="border p-2">{item.partner_name}</td>
                      <td className="border p-2 text-right">{quantity}</td>
                      <td className="border p-2 text-right">LKR {item.amount_total.toLocaleString()}</td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-100 font-bold">
                  <td className="border p-2" colSpan={3}>Total</td>
                  <td className="border p-2 text-right">{totalQuantity.toLocaleString()}</td>
                  <td className="border p-2 text-right">LKR {totalValue.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
