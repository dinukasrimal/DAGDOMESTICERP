
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Order, ProductionLine, Holiday } from '../types/scheduler';
import { DragDropContext, Droppable, DropResult } from 'react-beautiful-dnd';
import { format, differenceInDays, isWeekend, isSameDay } from 'date-fns';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Calendar, AlertTriangle } from 'lucide-react';
import { LinePdfExportButton } from './reports/LinePdfExportButton';

interface SchedulingBoardProps {
  orders: Order[];
  productionLines: ProductionLine[];
  holidays: Holiday[];
  // rampUpPlans: RampUpPlan[]; // REMOVED: We no longer use it for now.
  onOrderScheduled: (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => void;
  onOrderMovedToPending: (order: Order) => void;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
}

export const SchedulingBoard: React.FC<SchedulingBoardProps> = ({
  orders,
  productionLines,
  holidays,
  // rampUpPlans, // REMOVED: rampUpPlan logic is removed pending correct definition
  onOrderScheduled,
  onOrderMovedToPending,
  onOrderSplit
}) => {
  const [startDate, setStartDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [daysToShow, setDaysToShow] = useState(60);
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState<string | null>(null);
  const [splitOrderId, setSplitOrderId] = useState<string | null>(null);
  const [splitQuantity, setSplitQuantity] = useState<number>(0);
  
  const boardRef = useRef<HTMLDivElement>(null);
  const dateHeaderRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Generate dates for the board
  const dates = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < daysToShow; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      result.push(date);
    }
    return result;
  }, [startDate, daysToShow]);

  // Sync scroll between date header and board
  useEffect(() => {
    const board = boardRef.current;
    const dateHeader = dateHeaderRef.current;
    if (!board || !dateHeader) return;
    const handleScroll = () => {
      if (dateHeader) {
        dateHeader.scrollLeft = board.scrollLeft;
      }
    };
    board.addEventListener('scroll', handleScroll);
    return () => {
      board.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Handle drag end event
  const handleDragEnd = (result: DropResult) => {
    setDraggingOrderId(null);
    setHoveredDate(null);
    setHoveredLineId(null);
    
    const { destination, source, draggableId } = result;
    if (!destination) return;
    
    // Find the order being dragged
    const order = orders.find(o => o.id === draggableId);
    if (!order) return;
    
    // If dropped in the same place, do nothing
    if (destination.droppableId === source.droppableId) return;
    
    // If dropped back to pending
    if (destination.droppableId === 'pending') {
      onOrderMovedToPending(order);
      return;
    }
    
    // If dropped on a production line
    const [lineId, dateStr] = destination.droppableId.split('_');
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return;
    
    const startDate = new Date(dateStr);
    
    // Calculate end date based on order quantity and line capacity (NO ramp-up used)
    let remainingQuantity = order.orderQuantity;
    let currentDate = new Date(startDate);
    const dailyPlan: { [date: string]: number } = {};
    
    while (remainingQuantity > 0) {
      // Skip weekends and holidays
      const isHoliday = holidays.some(h => isSameDay(h.date, currentDate));
      if (!isWeekend(currentDate) && !isHoliday) {
        const dailyCapacity = line.capacity;
        const dailyProduction = Math.min(remainingQuantity, dailyCapacity);
        const dateKey = format(currentDate, 'yyyy-MM-dd');
        dailyPlan[dateKey] = dailyProduction;
        remainingQuantity -= dailyProduction;
      }
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      // Safety check to prevent infinite loop
      if (differenceInDays(currentDate, startDate) > 365) {
        break;
      }
    }
    // Calculate end date as the last day in the daily plan
    const planDates = Object.keys(dailyPlan).map(d => new Date(d));
    const endDate = planDates.length > 0 
      ? new Date(Math.max(...planDates.map(d => d.getTime())))
      : startDate;
    // Update order with new schedule
    onOrderScheduled({
      ...order,
      assignedLineId: line.id
    }, startDate, endDate, dailyPlan);
  };

  const handleDragStart = (start: any) => {
    setDraggingOrderId(start.draggableId);
  };

  const handleDateCellHover = (date: Date, lineId: string) => {
    setHoveredDate(date);
    setHoveredLineId(lineId);
  };

  const handleSplitOrder = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    setSplitOrderId(orderId);
    setSplitQuantity(Math.floor(order.orderQuantity / 2)); // Default to half
  };

  const confirmSplitOrder = () => {
    if (splitOrderId && splitQuantity > 0) {
      onOrderSplit(splitOrderId, splitQuantity);
      setSplitOrderId(null);
      setSplitQuantity(0);
    }
  };

  const cancelSplitOrder = () => {
    setSplitOrderId(null);
    setSplitQuantity(0);
  };

  // Filter scheduled orders
  const scheduledOrders = orders.filter(order => 
    order.status === 'scheduled' && 
    order.planStartDate && 
    order.planEndDate &&
    order.assignedLineId
  );

  // Group orders by line
  const ordersByLine = productionLines.reduce<Record<string, Order[]>>((acc, line) => {
    acc[line.id] = scheduledOrders.filter(order => order.assignedLineId === line.id);
    return acc;
  }, {});

  // Check if a date is a holiday
  const isHolidayDate = (date: Date) => {
    return holidays.some(holiday => isSameDay(holiday.date, date));
  };

  // Get holiday name if applicable
  const getHolidayName = (date: Date) => {
    const holiday = holidays.find(h => isSameDay(h.date, date));
    return holiday ? holiday.name : null;
  };

  // Calculate order position and width on the board
  const getOrderPosition = (order: Order) => {
    if (!order.planStartDate || !order.planEndDate) return null;
    
    const startDateObj = new Date(order.planStartDate);
    const endDateObj = new Date(order.planEndDate);
    
    const startDiff = differenceInDays(startDateObj, startDate);
    if (startDiff < 0) return null; // Order starts before visible range
    
    const endDiff = differenceInDays(endDateObj, startDate);
    if (endDiff < 0) return null; // Order ends before visible range
    
    const startPos = startDiff * 60; // Each day cell is 60px wide
    const width = (endDiff - startDiff + 1) * 60;
    
    return { left: startPos, width };
  };

  // Calculate daily production for visualization
  const getDailyProduction = (order: Order) => {
    if (!order.actualProduction) return {};
    return Object.entries(order.actualProduction).reduce<Record<string, number>>((acc, [date, qty]) => {
      // Only include dates within our visible range
      const orderDate = new Date(date);
      const diffFromStart = differenceInDays(orderDate, startDate);
      if (diffFromStart >= 0 && diffFromStart < daysToShow) {
        acc[date] = qty;
      }
      return acc;
    }, {});
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
      <div className="flex flex-col h-full">
        {/* Date header */}
        <div 
          ref={dateHeaderRef}
          className="flex border-b sticky top-0 z-10 bg-background overflow-hidden"
          style={{ width: 'calc(100% - 200px)', marginLeft: '200px' }}
        >
          {dates.map((date, index) => {
            const isWeekendDay = isWeekend(date);
            const isHoliday = isHolidayDate(date);
            const holidayName = getHolidayName(date);
            return (
              <div 
                key={index}
                className={`flex-shrink-0 w-[60px] p-1 text-center border-r text-xs ${
                  isWeekendDay ? 'bg-muted' : isHoliday ? 'bg-red-100' : ''
                }`}
              >
                <div>{format(date, 'EEE')}</div>
                <div className="font-bold">{format(date, 'd')}</div>
                <div>{format(date, 'MMM')}</div>
                {isHoliday && holidayName && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-red-500 mt-1">
                        <AlertTriangle size={12} className="inline" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{holidayName}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Main board area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Line names sidebar */}
          <div 
            ref={sidebarRef}
            className="w-[200px] flex-shrink-0 border-r"
          >
            {productionLines.map(line => (
              <div 
                key={line.id}
                className="h-[120px] border-b p-2 flex flex-col justify-between"
              >
                <div className="font-medium">{line.name}</div>
                <div className="text-xs text-muted-foreground">
                  Capacity: {line.capacity} pcs/day
                </div>
                <LinePdfExportButton
                  lineId={line.id}
                  lineName={line.name}
                  orders={orders.filter(o => o.assignedLineId === line.id && o.planStartDate)}
                />
              </div>
            ))}
          </div>
          
          {/* Scrollable board */}
          <div 
            ref={boardRef}
            className="flex-1 overflow-auto"
          >
            <div style={{ width: `${dates.length * 60}px`, position: 'relative' }}>
              {/* Line rows */}
              {productionLines.map(line => (
                <div 
                  key={line.id}
                  className="h-[120px] border-b relative"
                >
                  {/* Date cells for dropping */}
                  <div className="flex h-full">
                    {dates.map((date, dateIndex) => {
                      const isWeekendDay = isWeekend(date);
                      const isHoliday = isHolidayDate(date);
                      const droppableId = `${line.id}_${format(date, 'yyyy-MM-dd')}`;
                      const isHovered = hoveredLineId === line.id && 
                                       hoveredDate && 
                                       isSameDay(hoveredDate, date);
                      return (
                        <Droppable
                          key={dateIndex}
                          droppableId={droppableId}
                          isDropDisabled={isWeekendDay || isHoliday}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={`flex-shrink-0 w-[60px] h-full border-r ${
                                isWeekendDay ? 'bg-muted' : 
                                isHoliday ? 'bg-red-100' : 
                                isHovered ? 'bg-blue-50' : 
                                snapshot.isDraggingOver ? 'bg-green-50' : ''
                              }`}
                              onMouseEnter={() => handleDateCellHover(date, line.id)}
                            >
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      );
                    })}
                  </div>
                  {/* Orders positioned on the timeline */}
                  {ordersByLine[line.id]?.map(order => {
                    const position = getOrderPosition(order);
                    if (!position) return null;
                    const dailyProduction = getDailyProduction(order);
                    const isBeingDragged = draggingOrderId === order.id;
                    return (
                      <div
                        key={order.id}
                        className={`absolute top-1 h-[100px] ${
                          isBeingDragged ? 'opacity-50' : ''
                        }`}
                        style={{
                          left: `${position.left}px`,
                          width: `${position.width}px`,
                        }}
                      >
                        <Card 
                          className="h-full p-2 overflow-hidden border-2 border-primary bg-card"
                          onClick={() => setShowOrderDetails(order.id === showOrderDetails ? null : order.id)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="font-medium truncate text-sm">{order.poNumber}</div>
                            <Badge variant="outline" className="text-xs">
                              {order.styleId}
                            </Badge>
                          </div>
                          <div className="text-xs mt-1">Qty: {order.orderQuantity}</div>
                          <div className="flex items-center text-xs mt-1">
                            <Calendar size={12} className="mr-1" />
                            <span>
                              {order.planStartDate && format(new Date(order.planStartDate), 'MMM d')} - 
                              {order.planEndDate && format(new Date(order.planEndDate), 'MMM d')}
                            </span>
                          </div>
                          {/* Daily production visualization */}
                          {Object.keys(dailyProduction).length > 0 && (
                            <div className="mt-1 flex gap-1 overflow-hidden">
                              {Object.entries(dailyProduction).map(([date, qty]) => (
                                <Tooltip key={date}>
                                  <TooltipTrigger asChild>
                                    <div className="bg-primary/20 text-[10px] px-1 rounded">
                                      {qty}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{format(new Date(date), 'MMM d')}: {qty} pcs</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          )}
                          {/* Expanded details */}
                          {showOrderDetails === order.id && (
                            <div className="mt-2 text-xs border-t pt-1">
                              <div className="flex justify-between">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-6 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOrderMovedToPending(order);
                                  }}
                                >
                                  Move to Pending
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-6 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSplitOrder(order.id);
                                  }}
                                >
                                  Split Order
                                </Button>
                              </div>
                            </div>
                          )}
                        </Card>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Split order dialog */}
      {splitOrderId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-4 rounded-md shadow-lg w-[300px]">
            <h3 className="font-medium mb-4">Split Order</h3>
            <div className="mb-4">
              <label className="block text-sm mb-1">Split Quantity:</label>
              <input
                type="number"
                value={splitQuantity}
                onChange={(e) => setSplitQuantity(parseInt(e.target.value) || 0)}
                className="w-full p-2 border rounded"
                min="1"
                max={orders.find(o => o.id === splitOrderId)?.orderQuantity - 1 || 0}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelSplitOrder}>
                Cancel
              </Button>
              <Button onClick={confirmSplitOrder}>
                Split
              </Button>
            </div>
          </div>
        </div>
      )}
    </DragDropContext>
  );
};
