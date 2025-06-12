
import React, { useState } from 'react';
import { SchedulingBoard } from './SchedulingBoard';
import { PendingOrdersSidebar } from './PendingOrdersSidebar';
import { AdminPanel } from './AdminPanel';
import { Header } from './Header';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';

// Mock data for initial development
const initialOrders: Order[] = [
  {
    id: '1',
    poNumber: 'PO-2024-001',
    styleId: 'ST-001',
    orderQuantity: 1000,
    smv: 12.5,
    moCount: 25,
    cutQuantity: 1000,
    issueQuantity: 950,
    status: 'pending',
    planStartDate: null,
    planEndDate: null,
    actualProduction: {}
  },
  {
    id: '2',
    poNumber: 'PO-2024-002',
    styleId: 'ST-002',
    orderQuantity: 750,
    smv: 8.0,
    moCount: 20,
    cutQuantity: 750,
    issueQuantity: 720,
    status: 'pending',
    planStartDate: null,
    planEndDate: null,
    actualProduction: {}
  },
  {
    id: '3',
    poNumber: 'PO-2024-003',
    styleId: 'ST-003',
    orderQuantity: 1500,
    smv: 15.2,
    moCount: 30,
    cutQuantity: 1500,
    issueQuantity: 1450,
    status: 'pending',
    planStartDate: null,
    planEndDate: null,
    actualProduction: {}
  }
];

const initialProductionLines: ProductionLine[] = [
  { id: '1', name: 'Line A - Knitwear', capacity: 100 },
  { id: '2', name: 'Line B - Woven', capacity: 80 },
  { id: '3', name: 'Line C - Casual', capacity: 120 },
  { id: '4', name: 'Line D - Formal', capacity: 90 }
];

const initialRampUpPlans: RampUpPlan[] = [
  {
    id: '1',
    name: 'Standard Plan',
    efficiencies: [
      { day: 1, efficiency: 50 },
      { day: 2, efficiency: 70 },
      { day: 3, efficiency: 85 },
      { day: 4, efficiency: 90 }
    ],
    finalEfficiency: 90
  },
  {
    id: '2',
    name: 'Fast Track Plan',
    efficiencies: [
      { day: 1, efficiency: 70 },
      { day: 2, efficiency: 85 },
      { day: 3, efficiency: 95 }
    ],
    finalEfficiency: 95
  }
];

export const ProductionScheduler: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [productionLines, setProductionLines] = useState<ProductionLine[]>(initialProductionLines);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [rampUpPlans, setRampUpPlans] = useState<RampUpPlan[]>(initialRampUpPlans);
  const [scheduledOrders, setScheduledOrders] = useState<any[]>([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [userRole, setUserRole] = useState<'planner' | 'superuser'>('planner');

  const handleOrderSchedule = (order: Order, lineId: string, startDate: Date, rampUpPlanId: string) => {
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
    
    // Update order status
    setOrders(prev => prev.map(o => 
      o.id === order.id 
        ? { ...o, status: 'scheduled', planStartDate: startDate, planEndDate: endDate }
        : o
    ));
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
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header 
        userRole={userRole}
        onToggleAdmin={() => setShowAdminPanel(!showAdminPanel)}
        onRoleChange={setUserRole}
      />
      
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
            orders={orders.filter(o => o.status === 'pending')}
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
