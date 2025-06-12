
import React, { useState } from 'react';
import { SchedulingBoard } from './SchedulingBoard';
import { PendingOrdersSidebar } from './PendingOrdersSidebar';
import { AdminPanel } from './AdminPanel';
import { Header } from './Header';
import { GoogleSheetsConfig } from './GoogleSheetsConfig';
import { Order } from '../types/scheduler';
import { useProductionData } from '../hooks/useProductionData';
import { Button } from './ui/button';
import { RefreshCw, AlertCircle } from 'lucide-react';

export const ProductionScheduler: React.FC = () => {
  const {
    orders,
    productionLines,
    holidays,
    rampUpPlans,
    isLoading,
    error,
    isGoogleSheetsConfigured,
    setOrders,
    setProductionLines,
    setHolidays,
    setRampUpPlans,
    fetchOrdersFromGoogleSheets,
    configureGoogleSheets,
    updateOrderSchedule,
    updateOrderStatus,
    clearError
  } = useProductionData();

  const [scheduledOrders, setScheduledOrders] = useState<any[]>([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [userRole, setUserRole] = useState<'planner' | 'superuser'>('planner');

  const handleOrderSchedule = async (order: Order, lineId: string, startDate: Date, rampUpPlanId: string) => {
    const rampUpPlan = rampUpPlans.find(plan => plan.id === rampUpPlanId);
    if (!rampUpPlan) return;

    // Calculate daily production based on SMV and efficiency
    const calculateDailyProduction = (day: number) => {
      let efficiency = rampUpPlan.finalEfficiency;
      const dayPlan = rampUpPlan.efficiencies.find(e => e.day === day);
      if (dayPlan) {
        efficiency = dayPlan.efficiency;
      } else if (day <= Math.max(...rampUpPlan.efficiencies.map(e => e.day))) {
        const lastPlan = rampUpPlan.efficiencies[rampUpPlan.efficiencies.length - 1];
        efficiency = lastPlan.efficiency;
      }
      
      return Math.round((540 / order.smv) * (efficiency / 100) * order.moCount);
    };

    // Calculate end date
    let currentDate = new Date(startDate);
    let remainingQuantity = order.orderQuantity;
    let day = 1;

    while (remainingQuantity > 0) {
      // Skip weekends and holidays
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6 && 
          !holidays.some(h => h.date.toDateString() === currentDate.toDateString())) {
        const dailyProduction = calculateDailyProduction(day);
        remainingQuantity -= dailyProduction;
        day++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const endDate = new Date(currentDate);
    endDate.setDate(endDate.getDate() - 1);

    const scheduledOrder = {
      id: `scheduled-${Date.now()}`,
      orderId: order.id,
      lineId,
      startDate,
      endDate,
      rampUpPlanId,
      order
    };

    setScheduledOrders(prev => [...prev, scheduledOrder]);
    
    // Update order status to 'scheduled' and remove from pending list
    updateOrderStatus(order.id, 'scheduled');
    
    // Update order with plan dates
    setOrders(prev => prev.map(o => 
      o.id === order.id 
        ? { ...o, status: 'scheduled', planStartDate: startDate, planEndDate: endDate }
        : o
    ));

    // Update Google Sheets if configured
    if (isGoogleSheetsConfigured) {
      try {
        await updateOrderSchedule(order, startDate, endDate);
      } catch (err) {
        console.error('Failed to update Google Sheets:', err);
        // Continue with local update even if sheet update fails
      }
    }

    console.log(`Order ${order.poNumber} scheduled. Remaining pending orders: ${orders.filter(o => o.status === 'pending').length - 1}`);
  };

  const handleOrderSplit = (orderId: string, splitQuantity: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || splitQuantity >= order.orderQuantity) return;

    const remainingQuantity = order.orderQuantity - splitQuantity;
    
    const newOrder: Order = {
      ...order,
      id: `${order.id}-split-${Date.now()}`,
      poNumber: `${order.poNumber}-SPLIT`,
      orderQuantity: splitQuantity,
      cutQuantity: Math.round((order.cutQuantity * splitQuantity) / order.orderQuantity),
      issueQuantity: Math.round((order.issueQuantity * splitQuantity) / order.orderQuantity),
      status: 'pending',
      planStartDate: null,
      planEndDate: null,
      actualProduction: {}
    };

    setOrders(prev => [
      ...prev.map(o => 
        o.id === orderId 
          ? { 
              ...o, 
              orderQuantity: remainingQuantity,
              cutQuantity: order.cutQuantity - newOrder.cutQuantity,
              issueQuantity: order.issueQuantity - newOrder.issueQuantity
            }
          : o
      ),
      newOrder
    ]);

    console.log(`Order ${order.poNumber} split. New order: ${newOrder.poNumber} (${splitQuantity}), Remaining: ${remainingQuantity}`);
  };

  // Show Google Sheets configuration if not configured
  if (!isGoogleSheetsConfigured) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <Header 
          userRole={userRole}
          onToggleAdmin={() => setShowAdminPanel(!showAdminPanel)}
          onRoleChange={setUserRole}
        />
        
        <div className="flex-1 flex items-center justify-center p-8">
          <GoogleSheetsConfig 
            onConfigured={configureGoogleSheets}
            isConfigured={isGoogleSheetsConfigured}
          />
        </div>
      </div>
    );
  }

  // Filter pending orders for sidebar
  const pendingOrders = orders.filter(order => order.status === 'pending');
  
  return (
    <div className="flex flex-col h-screen bg-background">
      <Header 
        userRole={userRole}
        onToggleAdmin={() => setShowAdminPanel(!showAdminPanel)}
        onRoleChange={setUserRole}
      />
      
      {/* Sync Status Bar */}
      <div className="border-b border-border bg-card px-6 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <GoogleSheetsConfig 
              onConfigured={configureGoogleSheets}
              isConfigured={isGoogleSheetsConfigured}
            />
            
            <Button
              variant="outline"
              size="sm"
              onClick={fetchOrdersFromGoogleSheets}
              disabled={isLoading}
              className="flex items-center space-x-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync Orders</span>
            </Button>
            
            <div className="text-sm text-muted-foreground">
              Total: {orders.length} | Pending: {pendingOrders.length} | Scheduled: {orders.filter(o => o.status === 'scheduled').length}
            </div>
          </div>
          
          {error && (
            <div className="flex items-center space-x-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
              <Button variant="ghost" size="sm" onClick={clearError}>×</Button>
            </div>
          )}
        </div>
      </div>
      
      {showAdminPanel ? (
        <AdminPanel
          productionLines={productionLines}
          holidays={holidays}
          rampUpPlans={rampUpPlans}
          onProductionLinesChange={setProductionLines}
          onHolidaysChange={setHolidays}
          onRampUpPlansChange={setRampUpPlans}
        />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <PendingOrdersSidebar 
            orders={pendingOrders}
            onOrderSplit={handleOrderSplit}
          />
          
          <div className="flex-1">
            <SchedulingBoard
              productionLines={productionLines}
              scheduledOrders={scheduledOrders}
              holidays={holidays}
              rampUpPlans={rampUpPlans}
              onOrderSchedule={handleOrderSchedule}
              onScheduledOrdersChange={setScheduledOrders}
            />
          </div>
        </div>
      )}
    </div>
  );
};
