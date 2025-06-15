import React, { useState, useCallback, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { CalendarDays, FileDown, Search, Edit3 } from 'lucide-react';
import { OverlapConfirmationDialog } from './OverlapConfirmationDialog';
import { downloadElementAsPdf } from '../lib/pdfUtils';
import { DragDropProvider, useDragDrop } from './DragDropContext';
import { DroppableCell } from './DroppableCell';

interface SchedulingBoardProps {
  orders: Order[];
  productionLines: ProductionLine[];
  holidays: Holiday[];
  rampUpPlans: RampUpPlan[];
  onOrderScheduled: (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => Promise<void>;
  onOrderMovedToPending: (order: Order) => void;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
  onProductionLineUpdate?: (lineId: string, updates: Partial<ProductionLine>) => void;
}

const SchedulingBoardContent: React.FC<SchedulingBoardProps> = ({
  orders,
  productionLines,
  holidays,
  rampUpPlans,
  onOrderScheduled,
  onOrderMovedToPending,
  onOrderSplit,
  onProductionLineUpdate
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [scheduleDialog, setScheduleDialog] = useState<{
    isOpen: boolean;
    order: Order | null;
    lineId: string;
    startDate: Date | null;
    fillFirstDay?: number;
  }>({
    isOpen: false,
    order: null,
    lineId: '',
    startDate: null
  });

  const [overlapDialog, setOverlapDialog] = useState<{
    isOpen: boolean;
    newOrder: Order | null;
    overlappingOrders: Order[];
    targetDate: Date | null;
    targetLine: string;
    originalTargetDate: Date | null;
  }>({
    isOpen: false,
    newOrder: null,
    overlappingOrders: [],
    targetDate: null,
    targetLine: '',
    originalTargetDate: null
  });

  const [planningMethod, setPlanningMethod] = useState<'capacity' | 'rampup'>('capacity');
  const [selectedRampUpPlanId, setSelectedRampUpPlanId] = useState<string>('');
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [tempMoCount, setTempMoCount] = useState<number>(0);

  const { selectedOrders, isMultiSelectMode, clearSelection } = useDragDrop();

  // Generate date range dynamically based on scheduled orders
  const dates = useMemo(() => {
    const today = new Date();
    let maxEndDate = new Date(today);
    maxEndDate.setDate(maxEndDate.getDate() + 30); // Default minimum 30 days

    // Find the latest end date from all scheduled orders
    const scheduledOrders = orders.filter(order => order.status === 'scheduled' && order.planEndDate);
    if (scheduledOrders.length > 0) {
      const latestEndDate = Math.max(...scheduledOrders.map(order => order.planEndDate!.getTime()));
      const calculatedMaxDate = new Date(latestEndDate);
      calculatedMaxDate.setDate(calculatedMaxDate.getDate() + 14); // Add 2 weeks buffer
      
      if (calculatedMaxDate > maxEndDate) {
        maxEndDate = calculatedMaxDate;
      }
    }

    // Calculate number of days from today to maxEndDate
    const daysDiff = Math.ceil((maxEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const numberOfDays = Math.max(30, daysDiff); // Ensure at least 30 days

    return Array.from({ length: numberOfDays }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [orders]);

  // Filter orders based on search query
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    
    const query = searchQuery.toLowerCase().trim();
    return orders.filter(order => 
      order.poNumber.toLowerCase().includes(query) ||
      order.styleId.toLowerCase().includes(query)
    );
  }, [orders, searchQuery]);

  // Helper functions
  const isHoliday = useCallback((date: Date) => {
    return holidays.some(h => h.date.toDateString() === date.toDateString());
  }, [holidays]);

  const getOrdersForCell = useCallback((lineId: string, date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return filteredOrders.filter(order =>
      order.status === 'scheduled' &&
      order.assignedLineId === lineId &&
      order.actualProduction?.[dateStr] > 0
    );
  }, [filteredOrders]);

  const calculateTotalUtilization = useCallback((lineId: string, date: Date) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return 0;

    const dateStr = date.toISOString().split('T')[0];
    const ordersInCell = getOrdersForCell(lineId, date);
    const totalPlanned = ordersInCell.reduce((sum, order) =>
      sum + (order.actualProduction?.[dateStr] || 0), 0
    );

    return Math.min((totalPlanned / line.capacity) * 100, 100);
  }, [productionLines, getOrdersForCell]);

  const getAvailableCapacity = useCallback((lineId: string, date: Date) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return 0;

    const dateStr = date.toISOString().split('T')[0];
    const ordersInCell = getOrdersForCell(lineId, date);
    const totalUsed = ordersInCell.reduce((sum, order) =>
      sum + (order.actualProduction?.[dateStr] || 0), 0
    );

    return Math.max(0, line.capacity - totalUsed);
  }, [productionLines, getOrdersForCell]);

  // NEW: Calculate ramp-up capacity
  const calculateRampUpCapacity = useCallback((order: Order, line: ProductionLine, dayNumber: number, rampUpPlan: RampUpPlan) => {
    // Maximum ramp-up capacity per day = (MO Count × 540) / SMV
    const maxRampUpCapacity = (line.moCount * 540) / order.smv;
    
    // Find efficiency for this day
    let efficiency = rampUpPlan.finalEfficiency;
    const rampUpDay = rampUpPlan.efficiencies.find(e => e.day === dayNumber);
    if (rampUpDay) {
      efficiency = rampUpDay.efficiency;
    }
    
    // Apply efficiency to max capacity
    return Math.floor((maxRampUpCapacity * efficiency) / 100);
  }, []);

  const calculateDailyProductionWithRampUp = useCallback((order: Order, line: ProductionLine, startDate: Date, rampUpPlan: RampUpPlan) => {
    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity;
    let currentDate = new Date(startDate);
    let workingDayNumber = 1;

    console.log(`🔄 Calculating ramp-up production for ${order.poNumber}`);
    console.log(`📊 Line MO Count: ${line.moCount}, Order SMV: ${order.smv}`);

    while (remainingQty > 0) {
      const isWorkingDay = !isHoliday(currentDate);

      if (isWorkingDay) {
        const availableCapacity = getAvailableCapacity(line.id, currentDate);
        const rampUpCapacity = calculateRampUpCapacity(order, line, workingDayNumber, rampUpPlan);
        
        console.log(`📅 Day ${workingDayNumber}: Ramp-up capacity ${rampUpCapacity}, Available ${availableCapacity}`);
        
        // Use the minimum of ramp-up capacity and available capacity
        const dailyCapacity = Math.min(rampUpCapacity, availableCapacity);
        const plannedQty = Math.min(remainingQty, dailyCapacity);
        
        if (plannedQty > 0) {
          dailyPlan[currentDate.toISOString().split('T')[0]] = plannedQty;
          remainingQty -= plannedQty;
          console.log(`✅ Planned ${plannedQty} for ${currentDate.toDateString()}`);
        }
        workingDayNumber++;
      }

      currentDate.setDate(currentDate.getDate() + 1);

      if (currentDate.getTime() - startDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
        console.log('⚠️ Breaking due to excessive date range');
        break;
      }
    }

    return dailyPlan;
  }, [isHoliday, getAvailableCapacity, calculateRampUpCapacity]);

  const getContiguousProductionPlan = useCallback((
    qty: number,
    lineCapacity: number,
    startDate: Date,
    isHolidayFn: (d: Date) => boolean,
    fillFirstDay: number = 0
  ) => {
    const plan: { [date: string]: number } = {};
    let remainingQty = qty;
    let currentDate = new Date(startDate);
    let placedFirstDay = false;

    while (remainingQty > 0) {
      if (!isHolidayFn(currentDate)) {
        const dayStr = currentDate.toISOString().split('T')[0];
        let todayCapacity = lineCapacity;
        if (!placedFirstDay && fillFirstDay > 0) {
          todayCapacity = fillFirstDay;
          placedFirstDay = true;
        }
        const planned = Math.min(remainingQty, todayCapacity);
        if (planned > 0) {
          plan[dayStr] = planned;
          remainingQty -= planned;
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
      if (Object.keys(plan).length > 366) break;
    }
    return plan;
  }, []);

  const shouldHighlightRed = useCallback((order: Order, date: Date) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const isCurrentWeek = order.planStartDate &&
                         order.planStartDate >= startOfWeek &&
                         order.planStartDate <= endOfWeek;

    return order.cutQuantity === 0 &&
           isCurrentWeek &&
           order.planStartDate &&
           date.toDateString() === order.planStartDate.toDateString();
  }, []);

  const handleDownloadLinePdf = async (lineId: string, lineName: string) => {
    const reportId = `line-pdf-report-${lineId}`;
    const fileName = `${lineName.replace(/\s+/g, '_')}_Production_Plan`;
    await downloadElementAsPdf(reportId, fileName);
  };

  const getScheduledOrdersForLine = (lineId: string) => {
    return orders
      .filter(order => order.status === 'scheduled' && order.assignedLineId === lineId)
      .sort((a, b) =>
        (a.planStartDate?.getTime() || 0) - (b.planStartDate?.getTime() || 0)
      );
  };

  const handleLineEdit = (lineId: string) => {
    const line = productionLines.find(l => l.id === lineId);
    if (line) {
      setEditingLine(lineId);
      setTempMoCount(line.moCount || 0);
    }
  };

  const handleLineSave = async (lineId: string) => {
    if (onProductionLineUpdate) {
      await onProductionLineUpdate(lineId, { moCount: tempMoCount });
    }
    setEditingLine(null);
  };

  const handleScheduleConfirm = useCallback(async () => {
    const { order, lineId, startDate, fillFirstDay } = scheduleDialog;
    if (!order || !lineId || !startDate) return;
    
    const selectedLine = productionLines.find(l => l.id === lineId);
    if (!selectedLine) return;
    
    if (planningMethod === 'rampup' && !selectedRampUpPlanId) {
      console.log('❌ Ramp-up method selected but no plan chosen');
      return;
    }

    try {
      let dailyPlan: { [date: string]: number };
      
      if (planningMethod === 'capacity') {
        console.log('📊 Using capacity-based planning');
        dailyPlan = getContiguousProductionPlan(
          order.orderQuantity,
          selectedLine.capacity,
          startDate,
          isHoliday,
          fillFirstDay || 0
        );
      } else {
        console.log('🚀 Using ramp-up planning');
        const rampUpPlan = rampUpPlans.find(p => p.id === selectedRampUpPlanId);
        if (!rampUpPlan) {
          console.log('❌ Ramp-up plan not found');
          return;
        }
        
        dailyPlan = calculateDailyProductionWithRampUp(order, selectedLine, startDate, rampUpPlan);
      }
      
      const planDates = Object.keys(dailyPlan);
      const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
      const updatedOrder = { ...order, assignedLineId: lineId };
      
      await onOrderScheduled(updatedOrder, startDate, endDate, dailyPlan);
      setScheduleDialog({ isOpen: false, order: null, lineId: '', startDate: null });
      setPlanningMethod('capacity');
      setSelectedRampUpPlanId('');
    } catch (error) {
      console.error('❌ Failed to schedule order:', error);
    }
  }, [
    scheduleDialog, productionLines, planningMethod, selectedRampUpPlanId,
    rampUpPlans, calculateDailyProductionWithRampUp, getContiguousProductionPlan,
    onOrderScheduled, isHoliday
  ]);

  return (
    <div className="w-full h-full flex flex-col bg-background">
      {/* Search Bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Search by PO number or style..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4"
            />
          </div>
          {searchQuery && (
            <div className="mt-2 text-sm text-gray-600">
              {filteredOrders.filter(o => o.status === 'scheduled').length} scheduled orders found
            </div>
          )}
        </div>
      </div>

      {/* Multi-select info bar */}
      {isMultiSelectMode && selectedOrders.size > 0 && (
        <div className="sticky top-16 z-20 bg-blue-50 border-b border-blue-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-blue-800 font-medium text-sm">
              {selectedOrders.size} orders selected - Drag any selected order to move them all together
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-blue-800 hover:bg-blue-100"
              onClick={clearSelection}
            >
              Deselect All
            </Button>
          </div>
        </div>
      )}

      {/* PDF REPORTS (hidden, for each line) */}
      {productionLines.map(line => {
        const scheduledOrders = getScheduledOrdersForLine(line.id);
        if (scheduledOrders.length === 0) return null;
        return (
          <div
            id={`line-pdf-report-${line.id}`}
            key={`printable-${line.id}`}
            style={{ position: 'absolute', left: -9999, top: 0, width: '800px', background: '#fff', color: '#111', padding: 24, zIndex: -1000, fontSize: 14 }}
          >
            <div style={{ borderBottom: '2px solid #111', paddingBottom: 8, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Production Plan Report</h2>
              <div>Line: <b>{line.name}</b></div>
              <div>MO Count: <b>{line.moCount || 0}</b></div>
              <div>Generated on: {new Date().toLocaleString()}</div>
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>Order #</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>Style</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #aaa', padding: 6 }}>Quantity</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>PSD (Plan Start)</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>PED (Plan End)</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {scheduledOrders.map(order => (
                  <tr key={order.id}>
                    <td style={{ padding: 6 }}>{order.poNumber}</td>
                    <td style={{ padding: 6 }}>{order.styleId}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{order.orderQuantity.toLocaleString()}</td>
                    <td style={{ padding: 6 }}>
                      {order.planStartDate ? order.planStartDate.toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: 6 }}>
                      {order.planEndDate ? order.planEndDate.toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: 6 }}>
                      {order.planEndDate
                        ? (() => {
                          const d = new Date(order.planEndDate!);
                          d.setDate(d.getDate() + 1);
                          return d.toLocaleDateString();
                        })()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 24, fontStyle: 'italic', fontSize: 13 }}>
              * Delivery is estimated as one day after Plan End Date.
            </div>
          </div>
        );
      })}

      {/* Main Schedule Grid */}
      <div className="flex-1 overflow-auto bg-background">
        <div className="min-w-max">
          {/* Header Row */}
          <div className="sticky top-0 z-30 bg-white border-b-2 border-gray-200 shadow-sm flex">
            {/* Production Lines Header */}
            <div className="sticky left-0 z-40 w-80 bg-white border-r-2 border-gray-300 shadow-lg">
              <div className="h-20 p-4 flex items-center justify-center bg-gradient-to-r from-blue-50 to-blue-100 border-r border-gray-300">
                <div className="flex items-center space-x-3">
                  <CalendarDays className="h-6 w-6 text-blue-600" />
                  <span className="font-bold text-lg text-gray-800">Production Lines</span>
                </div>
              </div>
            </div>
            
            {/* Date Headers */}
            <div className="flex">
              {dates.map(date => (
                <div
                  key={date.toISOString()}
                  className={`w-40 h-20 p-3 border-r border-gray-200 flex flex-col justify-center items-center text-center ${
                    isHoliday(date) ? 'bg-red-50 border-red-200' : 'bg-white'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className="text-lg font-bold text-gray-800 mt-1">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  {isHoliday(date) && (
                    <div className="text-xs text-red-600 font-semibold mt-1">Holiday</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Production Line Rows */}
          {productionLines.map(line => (
            <div key={line.id} className="flex border-b border-gray-200">
              {/* Line Header */}
              <div className="sticky left-0 z-20 w-80 bg-white border-r-2 border-gray-300 shadow-md">
                <div className="h-40 p-4 flex flex-col justify-between bg-gradient-to-r from-gray-50 to-gray-100">
                  <div className="space-y-2">
                    <div className="font-bold text-gray-800 text-lg">{line.name}</div>
                    <div className="text-sm text-gray-600">
                      Capacity: <span className="font-semibold text-gray-800">{line.capacity}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">MO Count:</span>
                      {editingLine === line.id ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            type="number"
                            value={tempMoCount}
                            onChange={(e) => setTempMoCount(parseInt(e.target.value) || 0)}
                            className="w-16 h-6 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => handleLineSave(line.id)}
                          >
                            ✓
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => setEditingLine(null)}
                          >
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-gray-800">{line.moCount || 0}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-4 w-4 p-0"
                            onClick={() => handleLineEdit(line.id)}
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-9 flex items-center gap-2 font-medium border-gray-300 hover:bg-blue-50 hover:border-blue-300"
                    onClick={() => handleDownloadLinePdf(line.id, line.name)}
                    title="Download Production Plan PDF"
                  >
                    <FileDown className="w-4 h-4" />
                    Download Plan
                  </Button>
                </div>
              </div>

              {/* Date Cells for this Line */}
              <div className="flex">
                {dates.map(date => {
                  const utilizationPercent = calculateTotalUtilization(line.id, date);
                  const ordersInCell = getOrdersForCell(line.id, date);
                  const isHolidayCell = isHoliday(date);
                  const availableCapacity = getAvailableCapacity(line.id, date);

                  return (
                    <DroppableCell
                      key={`${line.id}-${date.toISOString().split('T')[0]}`}
                      lineId={line.id}
                      date={date}
                      orders={ordersInCell}
                      isHoliday={isHolidayCell}
                      utilizationPercent={utilizationPercent}
                      availableCapacity={availableCapacity}
                      onOrderMovedToPending={onOrderMovedToPending}
                      onOrderSplit={onOrderSplit}
                      hoveredCard={hoveredCard}
                      setHoveredCard={setHoveredCard}
                      shouldHighlightRed={shouldHighlightRed}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialog.isOpen} onOpenChange={(open) => !open && setScheduleDialog({ isOpen: false, order: null, lineId: '', startDate: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Order</DialogTitle>
          </DialogHeader>
          {scheduleDialog.order && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded">
                <h3 className="font-medium">{scheduleDialog.order.poNumber}</h3>
                <p className="text-sm text-muted-foreground">
                  Style: {scheduleDialog.order.styleId}
                </p>
                <p className="text-sm text-muted-foreground">
                  Quantity: {scheduleDialog.order.orderQuantity.toLocaleString()} | SMV: {scheduleDialog.order.smv} | MO: {scheduleDialog.order.moCount}
                </p>
                <p className="text-sm text-muted-foreground">
                  Cut: {scheduleDialog.order.cutQuantity.toLocaleString()} | Issue: {scheduleDialog.order.issueQuantity.toLocaleString()}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="font-medium">Start Date:</label>
                  <div>{scheduleDialog.startDate?.toLocaleDateString()}</div>
                </div>
                <div>
                  <label className="font-medium">Production Line:</label>
                  <div>{productionLines.find(l => l.id === scheduleDialog.lineId)?.name}</div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Planning Method:</label>
                <RadioGroup value={planningMethod} onValueChange={(value: 'capacity' | 'rampup') => setPlanningMethod(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="capacity" id="capacity" />
                    <Label htmlFor="capacity">Based on Line Capacity</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="rampup" id="rampup" />
                    <Label htmlFor="rampup">Based on Ramp-Up Plan</Label>
                  </div>
                </RadioGroup>
              </div>

              {planningMethod === 'rampup' && (
                <div>
                  <label className="text-sm font-medium">Ramp-Up Plan:</label>
                  <Select value={selectedRampUpPlanId} onValueChange={setSelectedRampUpPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a ramp-up plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {rampUpPlans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex space-x-2 pt-4">
                <Button
                  onClick={handleScheduleConfirm}
                  disabled={planningMethod === 'rampup' && !selectedRampUpPlanId}
                  className="flex-1"
                >
                  Schedule Order
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setScheduleDialog({ isOpen: false, order: null, lineId: '', startDate: null })}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Overlap Confirmation Dialog */}
      <OverlapConfirmationDialog
        isOpen={overlapDialog.isOpen}
        onClose={() => setOverlapDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {}}
        newOrder={overlapDialog.newOrder}
        overlappingOrders={overlapDialog.overlappingOrders}
        targetDate={overlapDialog.targetDate}
        targetLine={overlapDialog.targetLine}
      />
    </div>
  );
};

export const SchedulingBoard: React.FC<SchedulingBoardProps> = (props) => {
  return (
    <DragDropProvider
      orders={props.orders}
      onOrderScheduled={props.onOrderScheduled}
      onOrderMovedToPending={props.onOrderMovedToPending}
    >
      <SchedulingBoardContent {...props} />
    </DragDropProvider>
  );
};
