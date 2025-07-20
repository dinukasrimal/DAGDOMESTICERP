import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Package, Calendar, Clock, Users, TrendingUp, RefreshCw, AlertCircle, Plus, CalendarDays } from 'lucide-react';
import { supabaseBatchFetch } from '@/lib/utils';

interface PurchaseOrder {
  id: string;
  name: string;
  partner_name: string;
  date_order: string;
  amount_total: number;
  state: string;
  order_lines?: Array<{
    product_name: string;
    product_uom_qty: number;
    qty_received: number;
    price_unit: number;
    price_subtotal: number;
    product_category: string;
  }>;
  total_qty?: number;
  pending_qty?: number;
}

interface ProductionLine {
  id: string;
  name: string;
  capacity: number;
  current_load: number;
  efficiency: number;
  status: 'active' | 'maintenance' | 'offline';
}

interface PlannedOrder {
  id: string;
  po_id: string;
  line_id: string;
  scheduled_date: string;
  quantity: number;
  status: 'planned' | 'in_progress' | 'completed';
}

export const ProductionPlanner: React.FC = () => {
  const { toast } = useToast();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [plannedOrders, setPlannedOrders] = useState<PlannedOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [draggedPO, setDraggedPO] = useState<PurchaseOrder | null>(null);

  // Generate extended date range (3 months back, current month, 3 months forward)
  // Auto-extend by 2 months when orders exceed current range
  const dates = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Start 3 months before current month
    const startDate = new Date(currentYear, currentMonth - 3, 1);
    // End 3 months after current month
    let endDate = new Date(currentYear, currentMonth + 4, 0); // Last day of 3 months ahead
    
    // Check if any planned orders exceed the current date range
    const latestOrderDate = plannedOrders.reduce((latest, order) => {
      const orderDate = new Date(order.scheduled_date);
      return orderDate > latest ? orderDate : latest;
    }, new Date(0));
    
    // If orders exceed the current range, extend by 2 months
    if (latestOrderDate > endDate) {
      endDate = new Date(latestOrderDate.getFullYear(), latestOrderDate.getMonth() + 2 + 1, 0);
    }
    
    const allDates: Date[] = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      allDates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return allDates;
  }, [plannedOrders]);

  // Find current date index for auto-scrolling
  const currentDateIndex = useMemo(() => {
    const today = new Date();
    const todayStr = today.toDateString();
    return dates.findIndex(date => date.toDateString() === todayStr);
  }, [dates]);

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isPastDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    return compareDate < today;
  };

  // Fetch purchase orders from Supabase
  const fetchPurchaseOrders = async () => {
    setIsLoading(true);
    try {
      const data = await supabaseBatchFetch('purchases', 'date_order', 1000);
      if (data) {
        const transformedData: PurchaseOrder[] = data.map(purchase => {
          const orderLines = Array.isArray(purchase.order_lines) ? purchase.order_lines : [];
          const totalQty = orderLines.reduce((sum, line) => sum + (line.product_uom_qty || 0), 0);
          const receivedQty = orderLines.reduce((sum, line) => sum + (line.qty_received || 0), 0);
          
          return {
            id: purchase.id,
            name: purchase.name || '',
            partner_name: purchase.partner_name || '',
            date_order: purchase.date_order || '',
            amount_total: purchase.amount_total || 0,
            state: purchase.state || '',
            order_lines: orderLines,
            total_qty: totalQty,
            pending_qty: totalQty - receivedQty
          };
        });
        
        // Filter for purchase orders that have pending quantities
        const pendingOrders = transformedData.filter(po => 
          po.state === 'purchase' && (po.pending_qty || 0) > 0
        );
        
        setPurchaseOrders(pendingOrders);
      }
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      toast({
        title: "Error",
        description: "Failed to fetch purchase orders",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch production lines from Supabase
  const fetchProductionLines = async () => {
    try {
      const { data, error } = await supabase
        .from('production_lines')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching production lines:', error);
        // If no production lines table exists, create mock data
        const mockLines: ProductionLine[] = [
          { id: '1', name: 'Line A', capacity: 100, current_load: 60, efficiency: 85, status: 'active' },
          { id: '2', name: 'Line B', capacity: 120, current_load: 80, efficiency: 92, status: 'active' },
          { id: '3', name: 'Line C', capacity: 80, current_load: 30, efficiency: 78, status: 'maintenance' },
          { id: '4', name: 'Line D', capacity: 150, current_load: 120, efficiency: 90, status: 'active' },
        ];
        setProductionLines(mockLines);
      } else {
        setProductionLines(data || []);
      }
    } catch (error) {
      console.error('Error fetching production lines:', error);
      // Fallback to mock data
      const mockLines: ProductionLine[] = [
        { id: '1', name: 'Line A', capacity: 100, current_load: 60, efficiency: 85, status: 'active' },
        { id: '2', name: 'Line B', capacity: 120, current_load: 80, efficiency: 92, status: 'active' },
        { id: '3', name: 'Line C', capacity: 80, current_load: 30, efficiency: 78, status: 'maintenance' },
        { id: '4', name: 'Line D', capacity: 150, current_load: 120, efficiency: 90, status: 'active' },
      ];
      setProductionLines(mockLines);
    }
  };

  // Sync purchase orders from Odoo
  const syncPurchaseOrders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('odoo-purchases');
      if (error) {
        throw new Error(`Failed to sync purchase data: ${error.message}`);
      }
      if (data.success) {
        toast({
          title: 'Purchase Orders Synced',
          description: `${data.count} purchase orders synced successfully`,
        });
        await fetchPurchaseOrders();
      } else {
        throw new Error(data.error || 'Failed to sync purchase data');
      }
    } catch (error) {
      console.error('Sync failed:', error);
      toast({
        title: 'Sync Error',
        description: error instanceof Error ? error.message : 'Failed to sync purchase orders',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, po: PurchaseOrder) => {
    setDraggedPO(po);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, line: ProductionLine) => {
    e.preventDefault();
    if (draggedPO && line.status === 'active') {
      // Check if line has capacity
      const availableCapacity = line.capacity - line.current_load;
      const requiredCapacity = draggedPO.pending_qty || 0;
      
      if (availableCapacity >= requiredCapacity) {
        // Create planned order
        const plannedOrder: PlannedOrder = {
          id: Date.now().toString(),
          po_id: draggedPO.id,
          line_id: line.id,
          scheduled_date: new Date().toISOString().split('T')[0],
          quantity: requiredCapacity,
          status: 'planned'
        };
        
        setPlannedOrders(prev => [...prev, plannedOrder]);
        
        // Update line load
        setProductionLines(prev => 
          prev.map(l => 
            l.id === line.id 
              ? { ...l, current_load: l.current_load + requiredCapacity }
              : l
          )
        );
        
        // Remove PO from available list
        setPurchaseOrders(prev => prev.filter(po => po.id !== draggedPO.id));
        
        toast({
          title: 'Order Planned',
          description: `${draggedPO.name} assigned to ${line.name}`,
        });
      } else {
        toast({
          title: 'Insufficient Capacity',
          description: `${line.name} doesn't have enough capacity for this order`,
          variant: 'destructive',
        });
      }
    }
    setDraggedPO(null);
  };

  // Auto-scroll to current date on component mount
  useEffect(() => {
    fetchPurchaseOrders();
    fetchProductionLines();
  }, []);

  // Auto-scroll to current date when calendar is ready
  useEffect(() => {
    if (currentDateIndex >= 0) {
      // Delay scroll to ensure DOM is ready
      const timer = setTimeout(() => {
        const currentDateElement = document.getElementById(`date-${currentDateIndex}`);
        if (currentDateElement) {
          currentDateElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest', 
            inline: 'center' 
          });
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [currentDateIndex, productionLines.length]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'maintenance': return 'bg-yellow-500';
      case 'offline': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getCapacityColor = (current: number, capacity: number) => {
    const percentage = (current / capacity) * 100;
    if (percentage < 70) return 'text-green-600';
    if (percentage < 90) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg">
              <Calendar className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                Production Planner
              </h1>
              <p className="text-lg text-gray-600 mt-2">
                Drag & drop purchase orders to schedule production
              </p>
            </div>
          </div>
          <Button
            onClick={syncPurchaseOrders}
            disabled={isLoading}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
          >
            {isLoading ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Purchase Orders
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Purchase Orders Sidebar */}
          <Card className="lg:col-span-1 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="h-5 w-5 text-blue-600" />
                <span>Purchase Orders</span>
              </CardTitle>
              <CardDescription>
                Drag to schedule on calendar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                {purchaseOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No pending purchase orders</p>
                    <Button
                      onClick={syncPurchaseOrders}
                      variant="outline"
                      className="mt-4"
                    >
                      Sync from Odoo
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {purchaseOrders.map((po) => (
                      <div
                        key={po.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, po)}
                        className="p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-move"
                      >
                        <div className="space-y-2">
                          <h4 className="font-medium text-gray-900 text-sm">{po.name}</h4>
                          <p className="text-xs text-gray-600">{po.partner_name}</p>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-xs">
                              Qty: {po.pending_qty}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              LKR {(po.amount_total / 1000).toFixed(0)}K
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Calendar Grid */}
          <Card className="lg:col-span-3 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CalendarDays className="h-5 w-5 text-green-600" />
                  <span>Production Calendar</span>
                </div>
                <div className="text-sm text-gray-600">
                  {dates.length} days • {dates[0]?.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} to {dates[dates.length - 1]?.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
              </CardTitle>
              <CardDescription>
                Drop purchase orders onto production lines for specific dates. Scroll to view previous/future dates.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[600px]" id="calendar-container">
                <div className="min-w-max">
                  {/* Date Headers - Horizontal */}
                  <div className="sticky top-0 z-30 bg-white border-b-2 border-gray-200 shadow-sm flex">
                    {/* Production Lines Header */}
                    <div className="sticky left-0 z-40 w-48 bg-white border-r-2 border-gray-300 shadow-lg">
                      <div className="h-16 p-3 flex items-center justify-center bg-gradient-to-r from-blue-50 to-blue-100">
                        <span className="font-bold text-sm text-gray-800">Production Lines</span>
                      </div>
                    </div>
                    
                    {/* Date Headers */}
                    <div className="flex">
                      {dates.map((date, index) => (
                        <div
                          key={date.toISOString()}
                          id={`date-${index}`}
                          className={`w-28 h-16 p-2 border-r border-gray-200 flex flex-col justify-center items-center text-center relative ${
                            isToday(date) 
                              ? 'bg-blue-100 border-blue-300 ring-2 ring-blue-400' 
                              : isWeekend(date) 
                                ? 'bg-red-50 border-red-200' 
                                : isPastDate(date)
                                  ? 'bg-gray-50 border-gray-300'
                                  : 'bg-white'
                          }`}
                        >
                          {isToday(date) && (
                            <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          )}
                          <div className={`text-xs font-semibold uppercase ${
                            isToday(date) ? 'text-blue-700' : isPastDate(date) ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            {date.toLocaleDateString('en-US', { weekday: 'short' })}
                          </div>
                          <div className={`text-sm font-bold mt-1 ${
                            isToday(date) ? 'text-blue-800' : isPastDate(date) ? 'text-gray-500' : 'text-gray-800'
                          }`}>
                            {date.getDate()}
                          </div>
                          <div className={`text-xs mt-0.5 ${
                            isToday(date) ? 'text-blue-600' : isPastDate(date) ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            {date.toLocaleDateString('en-US', { month: 'short' })}
                          </div>
                          {isToday(date) && (
                            <div className="text-xs text-blue-600 font-semibold">Today</div>
                          )}
                          {isWeekend(date) && !isToday(date) && (
                            <div className="text-xs text-red-600 font-semibold">Weekend</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Production Line Rows */}
                  {productionLines.map(line => (
                    <div key={line.id} className="flex border-b border-gray-200">
                      {/* Line Header */}
                      <div className="sticky left-0 z-20 w-48 bg-white border-r-2 border-gray-300 shadow-md">
                        <div className="h-20 p-3 flex flex-col justify-center bg-gradient-to-r from-gray-50 to-gray-100">
                          <div className="space-y-1">
                            <div className="font-bold text-gray-800 text-sm">{line.name}</div>
                            <div className="text-xs text-gray-600">
                              Cap: <span className="font-semibold text-gray-800">{line.capacity}</span>
                            </div>
                            <div className="text-xs text-gray-600">
                              Load: <span className={`font-semibold ${getCapacityColor(line.current_load, line.capacity)}`}>
                                {line.current_load}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Date Cells */}
                      <div className="flex">
                        {dates.map((date, index) => (
                          <div
                            key={`${line.id}-${date.toISOString()}`}
                            className={`w-28 h-20 border-r border-gray-200 relative transition-all duration-200 ${
                              isToday(date)
                                ? 'bg-blue-50 border-blue-200'
                                : isWeekend(date)
                                  ? 'bg-red-50/50'
                                  : isPastDate(date)
                                    ? 'bg-gray-50/70'
                                    : line.status !== 'active'
                                      ? 'bg-gray-100/50'
                                      : 'bg-white hover:bg-blue-50'
                            }`}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, line)}
                          >
                            {/* Today Indicator */}
                            {isToday(date) && (
                              <div className="absolute top-1 left-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            )}

                            {/* Empty Cell Drop Zone */}
                            {!isWeekend(date) && !isPastDate(date) && line.status === 'active' && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <Plus className="h-4 w-4 text-gray-400" />
                              </div>
                            )}

                            {/* Line Status Indicator */}
                            {line.status !== 'active' && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <AlertCircle className="h-4 w-4 text-gray-400" />
                              </div>
                            )}

                            {/* Past Date Indicator */}
                            {isPastDate(date) && !isWeekend(date) && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs text-gray-400 font-semibold">PAST</span>
                              </div>
                            )}

                            {/* Weekend/Holiday Indicator */}
                            {isWeekend(date) && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs text-red-500 font-semibold">OFF</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Planned Orders Summary */}
        {plannedOrders.length > 0 && (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-purple-600" />
                <span>Recently Planned Orders</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plannedOrders.slice(0, 6).map((planned) => {
                  const line = productionLines.find(l => l.id === planned.line_id);
                  return (
                    <div key={planned.id} className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="space-y-2">
                        <div className="font-medium text-sm text-gray-900">{line?.name}</div>
                        <div className="text-xs text-gray-600">
                          Qty: {planned.quantity} | {planned.scheduled_date}
                        </div>
                        <Badge className="bg-green-100 text-green-800 text-xs">
                          {planned.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};