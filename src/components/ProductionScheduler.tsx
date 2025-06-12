
import React, { useState, useCallback, useEffect } from 'react';
import { SchedulingBoard } from './SchedulingBoard';
import { PendingOrdersSidebar } from './PendingOrdersSidebar';
import { AdminPanel } from './AdminPanel';
import { Header } from './Header';
import { AuthPage } from './AuthPage';
import { TooltipProvider } from './ui/tooltip';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { useAuth } from '../hooks/useAuth';
import { supabaseDataService } from '../services/supabaseDataService';
import { useToast } from '../hooks/use-toast';

export const ProductionScheduler: React.FC = () => {
  const { user, profile, loading } = useAuth();
  const { toast } = useToast();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [rampUpPlans, setRampUpPlans] = useState<RampUpPlan[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Load data from Supabase
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      setDataLoading(true);
      const [ordersData, linesData, holidaysData, plansData] = await Promise.all([
        supabaseDataService.fetchOrders(),
        supabaseDataService.fetchProductionLines(),
        supabaseDataService.fetchHolidays(),
        supabaseDataService.fetchRampUpPlans()
      ]);

      setOrders(ordersData);
      setProductionLines(linesData);
      setHolidays(holidaysData);
      setRampUpPlans(plansData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive'
      });
    } finally {
      setDataLoading(false);
    }
  };

  const handleToggleAdmin = () => {
    setShowAdminPanel(!showAdminPanel);
  };

  const handleOrderScheduled = useCallback(async (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => {
    try {
      const updatedOrder = {
        ...order,
        planStartDate: startDate,
        planEndDate: endDate,
        status: 'scheduled' as const,
        actualProduction: dailyPlan,
        assignedLineId: order.assignedLineId
      };

      await supabaseDataService.updateOrder(updatedOrder);
      
      setOrders(prevOrders => 
        prevOrders.map(o => o.id === order.id ? updatedOrder : o)
      );

      toast({
        title: 'Success',
        description: `Order ${order.poNumber} scheduled successfully`
      });
    } catch (error) {
      console.error('Failed to schedule order:', error);
      toast({
        title: 'Error',
        description: 'Failed to schedule order',
        variant: 'destructive'
      });
    }
  }, [toast]);

  const handleOrderMovedToPending = useCallback(async (order: Order) => {
    try {
      const updatedOrder = {
        ...order,
        planStartDate: null,
        planEndDate: null,
        status: 'pending' as const,
        actualProduction: {},
        assignedLineId: undefined
      };

      await supabaseDataService.updateOrder(updatedOrder);
      
      setOrders(prevOrders => 
        prevOrders.map(o => o.id === order.id ? updatedOrder : o)
      );

      toast({
        title: 'Success',
        description: `Order ${order.poNumber} moved to pending`
      });
    } catch (error) {
      console.error('Failed to move order to pending:', error);
      toast({
        title: 'Error',
        description: 'Failed to move order to pending',
        variant: 'destructive'
      });
    }
  }, [toast]);

  const handleOrderSplit = useCallback(async (orderId: string, splitQuantity: number) => {
    try {
      const orderToSplit = orders.find(o => o.id === orderId);
      if (!orderToSplit || splitQuantity >= orderToSplit.orderQuantity) {
        return;
      }

      const remainingQuantity = orderToSplit.orderQuantity - splitQuantity;
      
      // Get the base PO number (without any existing split suffix)
      let basePONumber = orderToSplit.poNumber;
      if (basePONumber.includes(' Split ')) {
        basePONumber = basePONumber.split(' Split ')[0];
      }
      
      // Find all orders that share the same base PO number
      const relatedOrders = orders.filter(o => {
        const orderBasePO = o.poNumber.includes(' Split ') ? o.poNumber.split(' Split ')[0] : o.poNumber;
        return orderBasePO === basePONumber;
      });
      
      // Find the next available split number
      const existingSplitNumbers = relatedOrders
        .filter(o => o.splitNumber !== undefined)
        .map(o => o.splitNumber!)
        .filter(num => num >= 0);
      
      const nextSplitNumber = existingSplitNumbers.length > 0 ? Math.max(...existingSplitNumbers) + 1 : 1;
      
      // Create the split order
      const splitOrder: Omit<Order, 'id'> = {
        poNumber: `${basePONumber} Split ${nextSplitNumber}`,
        styleId: orderToSplit.styleId,
        orderQuantity: splitQuantity,
        smv: orderToSplit.smv,
        moCount: orderToSplit.moCount,
        cutQuantity: Math.round((orderToSplit.cutQuantity / orderToSplit.orderQuantity) * splitQuantity),
        issueQuantity: Math.round((orderToSplit.issueQuantity / orderToSplit.orderQuantity) * splitQuantity),
        status: 'pending',
        planStartDate: null,
        planEndDate: null,
        actualProduction: {},
        assignedLineId: undefined,
        basePONumber: basePONumber,
        splitNumber: nextSplitNumber
      };

      // Create the new split order in database
      const newSplitOrder = await supabaseDataService.createOrder(splitOrder);

      // Update the original order
      const updatedOriginalOrder: Order = {
        ...orderToSplit,
        orderQuantity: remainingQuantity,
        cutQuantity: orderToSplit.cutQuantity - splitOrder.cutQuantity,
        issueQuantity: orderToSplit.issueQuantity - splitOrder.issueQuantity,
        basePONumber: basePONumber,
        splitNumber: orderToSplit.splitNumber !== undefined ? orderToSplit.splitNumber : 0
      };

      // If the original order doesn't have a split number, make it Split 0
      if (!orderToSplit.poNumber.includes(' Split ')) {
        updatedOriginalOrder.poNumber = `${basePONumber} Split 0`;
        updatedOriginalOrder.splitNumber = 0;
      }

      await supabaseDataService.updateOrder(updatedOriginalOrder);

      // Update state
      setOrders(prevOrders => 
        prevOrders.map(o => 
          o.id === orderId ? updatedOriginalOrder : o
        ).concat(newSplitOrder)
      );

      toast({
        title: 'Success',
        description: `Order split successfully: ${newSplitOrder.poNumber}`
      });
    } catch (error) {
      console.error('Failed to split order:', error);
      toast({
        title: 'Error',
        description: 'Failed to split order',
        variant: 'destructive'
      });
    }
  }, [orders, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthSuccess={() => {}} userRole={profile?.role} />;
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading data...</div>
      </div>
    );
  }

  // Filter pending orders
  const pendingOrders = orders.filter(order => 
    order.status === 'pending' && !order.planStartDate && !order.planEndDate
  );

  if (showAdminPanel) {
    return (
      <TooltipProvider>
        <AdminPanel
          orders={orders}
          productionLines={productionLines}
          holidays={holidays}
          rampUpPlans={rampUpPlans}
          onOrdersChange={setOrders}
          onProductionLinesChange={setProductionLines}
          onHolidaysChange={setHolidays}
          onRampUpPlansChange={setRampUpPlans}
          onClose={() => setShowAdminPanel(false)}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background">
        <Header
          userRole={profile?.role || 'planner'}
          onToggleAdmin={handleToggleAdmin}
          onRoleChange={() => {}} // Role change handled through profile
        />
        
        <div className="flex-1 flex overflow-hidden">
          <div className="w-80 border-r border-border bg-card flex flex-col">
            <div className="flex-1 overflow-hidden">
              <PendingOrdersSidebar
                orders={pendingOrders}
                onOrderSplit={handleOrderSplit}
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <SchedulingBoard
              orders={orders}
              productionLines={productionLines}
              holidays={holidays}
              rampUpPlans={rampUpPlans}
              onOrderScheduled={handleOrderScheduled}
              onOrderMovedToPending={handleOrderMovedToPending}
              onOrderSplit={handleOrderSplit}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
