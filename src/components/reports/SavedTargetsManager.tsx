import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Edit, Trash2, Eye, Calendar, User, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SavedTarget {
  id: string;
  customer_name: string;
  target_year: string;
  target_months: string[];
  base_year: string;
  target_data: any;
  initial_total_qty: number;
  initial_total_value: number;
  adjusted_total_qty: number;
  adjusted_total_value: number;
  percentage_increase: number;
  created_at: string;
  updated_at: string;
}

const months = [
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

export const SavedTargetsManager: React.FC = () => {
  const { toast } = useToast();
  const [savedTargets, setSavedTargets] = useState<SavedTarget[]>([]);
  const [filteredTargets, setFilteredTargets] = useState<SavedTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [viewingTarget, setViewingTarget] = useState<SavedTarget | null>(null);
  const [editingTarget, setEditingTarget] = useState<SavedTarget | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<SavedTarget | null>(null);
  const [editedTargetData, setEditedTargetData] = useState<any[]>([]);

  // Get unique customers and years from saved targets
  const customers = Array.from(new Set(savedTargets.map(target => target.customer_name))).filter(Boolean);
  const years = Array.from(new Set(savedTargets.map(target => target.target_year))).filter(Boolean).sort();

  // Fetch saved targets on component mount
  useEffect(() => {
    fetchSavedTargets();
  }, []);

  // Filter targets when filters change
  useEffect(() => {
    let filtered = savedTargets;
    
    if (selectedCustomer) {
      filtered = filtered.filter(target => target.customer_name === selectedCustomer);
    }
    
    if (selectedYear) {
      filtered = filtered.filter(target => target.target_year === selectedYear);
    }
    
    setFilteredTargets(filtered);
  }, [savedTargets, selectedCustomer, selectedYear]);

  const fetchSavedTargets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales_targets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setSavedTargets(data || []);
    } catch (error) {
      console.error('Error fetching saved targets:', error);
      toast({
        title: "Error",
        description: "Failed to fetch saved targets",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTarget = async (target: SavedTarget) => {
    try {
      const { error } = await supabase
        .from('sales_targets')
        .delete()
        .eq('id', target.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Target Deleted",
        description: `Target for ${target.customer_name} deleted successfully`,
      });

      fetchSavedTargets();
      setDeletingTarget(null);
    } catch (error) {
      console.error('Error deleting target:', error);
      toast({
        title: "Error",
        description: "Failed to delete target",
        variant: "destructive",
      });
    }
  };

  const handleEditTarget = (target: SavedTarget) => {
    setEditingTarget(target);
    setEditedTargetData([...target.target_data]);
  };

  const handleUpdateTarget = async () => {
    if (!editingTarget) return;

    try {
      const adjustedTotalQty = editedTargetData.reduce((sum, item) => sum + item.quantity, 0);
      const adjustedTotalValue = editedTargetData.reduce((sum, item) => sum + item.value, 0);
      const initialTotalQty = editedTargetData.reduce((sum, item) => sum + item.initial_quantity, 0);
      const percentageInc = initialTotalQty > 0 ? ((adjustedTotalQty - initialTotalQty) / initialTotalQty * 100) : 0;

      const { error } = await supabase
        .from('sales_targets')
        .update({
          target_data: editedTargetData,
          adjusted_total_qty: adjustedTotalQty,
          adjusted_total_value: adjustedTotalValue,
          percentage_increase: percentageInc,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingTarget.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Target Updated",
        description: `Target for ${editingTarget.customer_name} updated successfully`,
      });

      fetchSavedTargets();
      setEditingTarget(null);
      setEditedTargetData([]);
    } catch (error) {
      console.error('Error updating target:', error);
      toast({
        title: "Error",
        description: "Failed to update target",
        variant: "destructive",
      });
    }
  };

  const handleQuantityChange = (index: number, value: string) => {
    const quantity = Math.ceil(parseFloat(value) || 0);
    setEditedTargetData(prev => prev.map((item, i) => {
      if (i === index) {
        const unitPrice = item.initial_quantity > 0 ? item.initial_value / item.initial_quantity : 0;
        const newValue = Math.round(quantity * unitPrice);
        return { ...item, quantity, value: newValue };
      }
      return item;
    }));
  };

  const handleValueChange = (index: number, value: string) => {
    const newValue = Math.round(parseFloat(value) || 0);
    setEditedTargetData(prev => prev.map((item, i) => {
      if (i === index) {
        return { ...item, value: newValue };
      }
      return item;
    }));
  };

  const getMonthNames = (monthValues: string[]) => {
    return monthValues
      .map(value => months.find(m => m.value === value)?.label)
      .filter(Boolean)
      .join(', ');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6" />
          Saved Sales Targets
        </h2>
        <Button onClick={fetchSavedTargets} variant="outline" disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Filter by Customer</Label>
          <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
            <SelectTrigger>
              <SelectValue placeholder="All customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All customers</SelectItem>
              {customers.map(customer => (
                <SelectItem key={customer} value={customer}>
                  {customer}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Filter by Year</Label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger>
              <SelectValue placeholder="All years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All years</SelectItem>
              {years.map(year => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end">
          <Button 
            onClick={() => {
              setSelectedCustomer('');
              setSelectedYear('');
            }}
            variant="outline"
            className="w-full"
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Targets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTargets.map(target => (
          <Card key={target.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-4 w-4" />
                {target.customer_name}
              </CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Target Year: {target.target_year}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Target Months</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {target.target_months.map(month => {
                    const monthName = months.find(m => m.value === month)?.label;
                    return (
                      <Badge key={month} variant="secondary" className="text-xs">
                        {monthName}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Target Qty</Label>
                  <p className="font-medium">{target.adjusted_total_qty.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Target Value</Label>
                  <p className="font-medium">LKR {Math.round(target.adjusted_total_value).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Increase</Label>
                <p className="font-medium text-green-600">+{target.percentage_increase.toFixed(1)}%</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewingTarget(target)}
                  className="flex-1"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEditTarget(target)}
                  className="flex-1"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeletingTarget(target)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTargets.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">No targets found</h3>
          <p>No saved targets match your current filters.</p>
        </div>
      )}

      {/* View Target Dialog */}
      <Dialog open={!!viewingTarget} onOpenChange={() => setViewingTarget(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Target Details - {viewingTarget?.customer_name} ({viewingTarget?.target_year})
            </DialogTitle>
          </DialogHeader>

          {viewingTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="font-medium">Base Year:</Label>
                  <p>{viewingTarget.base_year}</p>
                </div>
                <div>
                  <Label className="font-medium">Target Months:</Label>
                  <p>{getMonthNames(viewingTarget.target_months)}</p>
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                <h4 className="font-medium">Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Initial Total Qty: </span>
                    <span>{viewingTarget.initial_total_qty.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="font-medium">Target Qty: </span>
                    <span className="font-semibold">{viewingTarget.adjusted_total_qty.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="font-medium">Initial Total Value: </span>
                    <span>LKR {Math.round(viewingTarget.initial_total_value).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="font-medium">Target Value: </span>
                    <span className="font-semibold">LKR {Math.round(viewingTarget.adjusted_total_value).toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-sm">
                  <span className="font-medium">Percentage Increase: </span>
                  <span className="text-green-600 font-semibold">+{viewingTarget.percentage_increase.toFixed(1)}%</span>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted p-2 grid grid-cols-3 gap-4 font-medium text-sm">
                  <div>Category</div>
                  <div>Target Quantity</div>
                  <div>Target Value (LKR)</div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {viewingTarget.target_data.map((item: any, index: number) => (
                    <div key={index} className="p-2 grid grid-cols-3 gap-4 border-t text-sm">
                      <div className="font-medium">{item.product_category}</div>
                      <div>{item.quantity.toLocaleString()}</div>
                      <div>LKR {Math.round(item.value).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Target Dialog */}
      <Dialog open={!!editingTarget} onOpenChange={() => {
        setEditingTarget(null);
        setEditedTargetData([]);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Target - {editingTarget?.customer_name} ({editingTarget?.target_year})
            </DialogTitle>
          </DialogHeader>

          {editingTarget && (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted p-2 grid grid-cols-3 gap-4 font-medium text-sm">
                  <div>Category</div>
                  <div>Target Quantity</div>
                  <div>Target Value (LKR)</div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {editedTargetData.map((item: any, index: number) => (
                    <div key={index} className="p-2 grid grid-cols-3 gap-4 border-t text-sm">
                      <div className="font-medium flex items-center">{item.product_category}</div>
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
                      <div>
                        <Input
                          type="number"
                          value={Math.round(item.value)}
                          onChange={(e) => handleValueChange(index, e.target.value)}
                          className="w-full"
                          min="0"
                          step="1"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleUpdateTarget} className="flex-1">
                  Update Target
                </Button>
                <Button 
                  onClick={() => {
                    setEditingTarget(null);
                    setEditedTargetData([]);
                  }} 
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingTarget} onOpenChange={() => setDeletingTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Target</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the target for {deletingTarget?.customer_name} 
              for {deletingTarget?.target_year}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingTarget && handleDeleteTarget(deletingTarget)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};