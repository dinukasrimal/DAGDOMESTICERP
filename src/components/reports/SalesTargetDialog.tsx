import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X, Target, TrendingUp, Trash2, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

interface SalesTargetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  salesData: SalesData[];
}

interface MonthData {
  value: string;
  label: string;
}

interface TargetItem {
  product_name: string;
  product_category: string;
  quantity: number;
  value: number;
}

interface SavedTarget {
  customer: string;
  year: string;
  month: string;
  data: TargetItem[];
}

const months: MonthData[] = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export const SalesTargetDialog: React.FC<SalesTargetDialogProps> = ({
  isOpen,
  onClose,
  salesData,
}) => {
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [targetData, setTargetData] = useState<TargetItem[]>([]);
  const [percentageIncrease, setPercentageIncrease] = useState<string>('');
  const [savedTargets, setSavedTargets] = useState<SavedTarget[]>([]);

  // Get unique customers
  const customers = Array.from(new Set(salesData.map(item => item.partner_name))).filter(Boolean);

  // Get last 3 years
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 3, currentYear - 2, currentYear - 1].map(year => year.toString());

  // Calculate totals
  const totals = useMemo(() => {
    const totalQuantity = targetData.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = targetData.reduce((sum, item) => sum + item.value, 0);
    return { totalQuantity, totalValue };
  }, [targetData]);

  // Check if a month is locked (has saved targets)
  const isMonthLocked = (monthValue: string) => {
    return savedTargets.some(target => 
      target.customer === selectedCustomer && 
      target.year === selectedYear && 
      target.month === monthValue
    );
  };

  const handleMonthToggle = (monthValue: string) => {
    if (isMonthLocked(monthValue)) return; // Don't toggle locked months
    
    setSelectedMonths(prev => 
      prev.includes(monthValue) 
        ? prev.filter(m => m !== monthValue)
        : [...prev, monthValue]
    );
  };

  const removeMonth = (monthValue: string) => {
    setSelectedMonths(prev => prev.filter(m => m !== monthValue));
  };

  const deleteMonthTarget = (monthValue: string) => {
    setSavedTargets(prev => prev.filter(target => 
      !(target.customer === selectedCustomer && 
        target.year === selectedYear && 
        target.month === monthValue)
    ));
    toast({
      title: "Target Deleted",
      description: `Target for ${months.find(m => m.value === monthValue)?.label} has been deleted`,
    });
  };

  const getTargetData = () => {
    if (!selectedCustomer || !selectedYear || selectedMonths.length === 0) return;

    // Filter historical data for selected year, customer, and months
    const yearData = salesData.filter(item => {
      if (item.partner_name !== selectedCustomer) return false;
      if (!item.date_order) return false;
      
      const orderDate = new Date(item.date_order);
      const orderMonth = String(orderDate.getMonth() + 1).padStart(2, '0');
      const orderYear = orderDate.getFullYear().toString();
      
      return selectedMonths.includes(orderMonth) && orderYear === selectedYear;
    });

    // Process year data
    const productData: { [key: string]: TargetItem } = {};
    
    yearData.forEach(item => {
      if (item.order_lines) {
        item.order_lines.forEach(line => {
          const key = `${line.product_name}_${line.product_category}`;
          if (!productData[key]) {
            productData[key] = {
              product_name: line.product_name,
              product_category: line.product_category,
              quantity: 0,
              value: 0,
            };
          }
          productData[key].quantity += line.qty_delivered;
          productData[key].value += line.price_subtotal;
        });
      }
    });

    const processedData = Object.values(productData).map(item => ({
      ...item,
      quantity: Math.ceil(item.quantity) // Round up to nearest whole number
    }));

    setTargetData(processedData);
  };

  const handleQuantityChange = (index: number, value: string) => {
    const quantity = Math.ceil(parseFloat(value) || 0);
    setTargetData(prev => prev.map((item, i) => 
      i === index ? { ...item, quantity } : item
    ));
  };

  const applyPercentageIncrease = () => {
    const percentage = parseFloat(percentageIncrease);
    if (isNaN(percentage)) {
      toast({
        title: "Invalid Percentage",
        description: "Please enter a valid percentage value",
        variant: "destructive",
      });
      return;
    }

    setTargetData(prev => prev.map(item => ({
      ...item,
      quantity: Math.ceil(item.quantity * (1 + percentage / 100))
    })));

    setPercentageIncrease(''); // Clear the input
    toast({
      title: "Targets Updated",
      description: `Applied ${percentage}% increase to all quantities`,
    });
  };

  const handleSaveTargets = () => {
    // Save targets for each selected month
    const newTargets: SavedTarget[] = selectedMonths.map(month => ({
      customer: selectedCustomer,
      year: selectedYear,
      month,
      data: [...targetData]
    }));

    setSavedTargets(prev => [
      ...prev.filter(target => 
        !(target.customer === selectedCustomer && 
          target.year === selectedYear && 
          selectedMonths.includes(target.month))
      ),
      ...newTargets
    ]);

    setSelectedMonths([]);
    setTargetData([]);
    
    toast({
      title: "Targets Saved",
      description: `Sales targets saved for ${selectedCustomer} for selected months`,
    });
  };

  const handleClose = () => {
    // Reset all state
    setSelectedCustomer('');
    setSelectedYear('');
    setSelectedMonths([]);
    setTargetData([]);
    setPercentageIncrease('');
    setSavedTargets([]);
    onClose();
  };

  // Reset data when customer or year changes
  useEffect(() => {
    setSelectedMonths([]);
    setTargetData([]);
  }, [selectedCustomer, selectedYear]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-6 w-6" />
            Set Sales Targets
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Customer Selection - At Top */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Customer</Label>
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Choose customer..." />
              </SelectTrigger>
              <SelectContent className="bg-background border z-50">
                {customers.map(customer => (
                  <SelectItem key={customer} value={customer}>
                    {customer}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCustomer && (
              <Badge variant="default" className="flex items-center gap-1 w-fit">
                {selectedCustomer}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setSelectedCustomer('')}
                />
              </Badge>
            )}
          </div>

          {/* Year Selection - Before Months */}
          {selectedCustomer && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Base Year for Targets</Label>
              <div className="grid grid-cols-3 gap-2">
                {years.map(year => (
                  <Button
                    key={year}
                    variant={selectedYear === year ? "default" : "outline"}
                    onClick={() => setSelectedYear(year)}
                    className="w-full"
                  >
                    {year}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Month Selection - After Year */}
          {selectedCustomer && selectedYear && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Target Months</Label>
              <div className="grid grid-cols-3 gap-2">
                {months.map(month => {
                  const locked = isMonthLocked(month.value);
                  return (
                    <div key={month.value} className="flex items-center justify-between space-x-2 p-2 border rounded">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={month.value}
                          checked={selectedMonths.includes(month.value)}
                          onCheckedChange={() => handleMonthToggle(month.value)}
                          disabled={locked}
                        />
                        <Label htmlFor={month.value} className={`text-sm ${locked ? 'text-muted-foreground' : ''}`}>
                          {month.label}
                        </Label>
                      </div>
                      {locked && (
                        <div className="flex items-center gap-1">
                          <Lock className="h-3 w-3 text-muted-foreground" />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteMonthTarget(month.value)}
                            className="h-6 w-6 p-0"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedMonths.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedMonths.map(monthValue => {
                    const month = months.find(m => m.value === monthValue);
                    return (
                      <Badge key={monthValue} variant="secondary" className="flex items-center gap-1">
                        {month?.label}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => removeMonth(monthValue)}
                        />
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Get Target Data Button */}
          {selectedCustomer && selectedYear && selectedMonths.length > 0 && (
            <Button onClick={getTargetData} className="w-full">
              Get Target Data for {selectedYear}
            </Button>
          )}

          {/* Target Data Display and Editing */}
          {targetData.length > 0 && (
            <div className="space-y-4">
              {/* Totals Display */}
              <div className="bg-muted p-4 rounded-lg">
                <h3 className="font-medium mb-2">Target Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Total Target Quantity:</span>
                    <div className="text-xl font-bold">{totals.totalQuantity.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Total Base Value:</span>
                    <div className="text-xl font-bold">LKR {totals.totalValue.toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Target Data for {selectedYear} - {selectedMonths.map(m => months.find(month => month.value === m)?.label).join(', ')}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="% increase"
                    value={percentageIncrease}
                    onChange={(e) => setPercentageIncrease(e.target.value)}
                    className="w-20"
                  />
                  <Button onClick={applyPercentageIncrease} size="sm">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Apply %
                  </Button>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted p-2 grid grid-cols-4 gap-4 font-medium text-sm">
                  <div>Product Name</div>
                  <div>Category</div>
                  <div>Target Quantity</div>
                  <div>Base Value (LKR)</div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {targetData.map((item, index) => (
                    <div key={index} className="p-2 grid grid-cols-4 gap-4 border-t text-sm">
                      <div className="truncate">{item.product_name}</div>
                      <div className="truncate">{item.product_category}</div>
                      <div>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleQuantityChange(index, e.target.value)}
                          className="w-full"
                          min="0"
                          step="1"
                        />
                      </div>
                      <div>LKR {item.value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSaveTargets} className="flex-1">
                  Save Targets
                </Button>
                <Button onClick={handleClose} variant="outline">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {targetData.length === 0 && selectedCustomer && selectedYear && selectedMonths.length > 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Click "Get Target Data" to load sales data for the selected period.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};