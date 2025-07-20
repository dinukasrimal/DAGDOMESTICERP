import React, { useState, useCallback, useMemo } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Settings, 
  Calendar,
  Package,
  Factory
} from 'lucide-react';

import { useProductionPlanning } from '@/hooks/useProductionPlanning';
import { PurchaseOrderSidebar } from './planning/PurchaseOrderSidebar';
import { ProductionCalendar } from './planning/ProductionCalendar';
import { ProductionLineManager } from './planning/ProductionLineManager';
import { OverlapDialog } from './planning/OverlapDialog';
import { SplitDialog } from './planning/SplitDialog';

import type { 
  Purchase, 
  ProductionLine, 
  PlannedProduction,
  OverlapDialog as OverlapDialogType,
  SplitDialog as SplitDialogType,
  PlanningPosition
} from '@/types/planning';

export const ProductionPlanningBoard: React.FC = () => {
  const {
    purchases,
    orderLines,
    productionLines,
    plannedProduction,
    holidays,
    isLoading,
    fetchOrderLines,
    fetchOrderLinesForTooltip,
    createProductionLine,
    updateProductionLineCapacity,
    planPurchaseOrder,
    movePlannedToSidebar,
    refetchData
  } = useProductionPlanning();

  // UI State
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [showLineManager, setShowLineManager] = useState(false);
  const [selectedPlanned, setSelectedPlanned] = useState<Set<string>>(new Set());
  
  // Dialog states
  const [overlapDialog, setOverlapDialog] = useState<OverlapDialogType>({ show: false });
  const [splitDialog, setSplitDialog] = useState<SplitDialogType>({ 
    show: false, 
    availableLines: productionLines 
  });

  // Week navigation
  const weekStart = useMemo(() => startOfWeek(currentWeek, { weekStartsOn: 1 }), [currentWeek]);
  const weekEnd = useMemo(() => endOfWeek(currentWeek, { weekStartsOn: 1 }), [currentWeek]);
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const goToPreviousWeek = useCallback(() => {
    setCurrentWeek(prev => subWeeks(prev, 1));
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentWeek(prev => addWeeks(prev, 1));
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setCurrentWeek(new Date());
  }, []);

  // Purchase order selection
  const handlePurchaseSelect = useCallback(async (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    await fetchOrderLines(purchase.id);
  }, [fetchOrderLines]);

  // Drag and drop handlers
  const handlePurchaseDrop = useCallback(async (
    purchase: Purchase,
    lineId: string,
    date: Date,
    targetPlanned?: PlannedProduction
  ) => {
    if (targetPlanned) {
      // Show overlap dialog
      setOverlapDialog({
        show: true,
        targetPlanned,
        draggedPurchase: purchase,
        position: { lineId, date }
      });
    } else {
      // Direct planning
      await planPurchaseOrder(purchase, lineId, date);
    }
  }, [planPurchaseOrder]);

  const handlePlannedMove = useCallback(async (
    planned: PlannedProduction,
    newLineId: string,
    newDate: Date
  ) => {
    // Implementation for moving planned production
    // This would involve updating the database and recalculating
    console.log('Moving planned production:', planned, newLineId, newDate);
  }, []);

  // Context menu handlers
  const handlePlannedRightClick = useCallback((
    event: React.MouseEvent,
    planned: PlannedProduction
  ) => {
    event.preventDefault();
    // Show context menu
    console.log('Right click on planned:', planned);
  }, []);

  const handleMovePlannedToSidebar = useCallback(async (plannedId: string) => {
    await movePlannedToSidebar(plannedId);
  }, [movePlannedToSidebar]);

  const handleSplitPlanned = useCallback((planned: PlannedProduction) => {
    setSplitDialog({
      show: true,
      plannedProduction: planned,
      availableLines: productionLines.filter(line => line.id !== planned.line_id)
    });
  }, [productionLines]);

  // Multi-select handlers
  const handlePlannedSelect = useCallback((plannedId: string, isMultiSelect: boolean) => {
    if (isMultiSelect) {
      setSelectedPlanned(prev => {
        const newSet = new Set(prev);
        if (newSet.has(plannedId)) {
          newSet.delete(plannedId);
        } else {
          newSet.add(plannedId);
        }
        return newSet;
      });
    } else {
      setSelectedPlanned(new Set([plannedId]));
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPlanned(new Set());
  }, []);

  // Filter planned production for current week
  const weekPlannedProduction = useMemo(() => {
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
    
    return plannedProduction.filter(plan => 
      plan.planned_date >= weekStartStr && plan.planned_date <= weekEndStr
    );
  }, [plannedProduction, weekStart, weekEnd]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Factory className="h-8 w-8 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">Production Planning</h1>
              </div>
              <Badge variant="outline" className="text-sm">
                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </Badge>
            </div>

            <div className="flex items-center space-x-3">
              {/* Week Navigation */}
              <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPreviousWeek}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToCurrentWeek}
                  className="h-8 px-3 text-sm font-medium"
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNextWeek}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Action Buttons */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLineManager(true)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage Lines
              </Button>

              <Button
                size="sm"
                onClick={refetchData}
                disabled={isLoading}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Multi-select toolbar */}
        {selectedPlanned.size > 0 && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-blue-900">
                  {selectedPlanned.size} item{selectedPlanned.size > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Button size="sm" variant="outline" onClick={clearSelection}>
                  Clear Selection
                </Button>
                <Button size="sm" variant="outline">
                  Move Selected
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
            <PurchaseOrderSidebar
              purchases={purchases}
              orderLines={orderLines}
              selectedPurchase={selectedPurchase}
              onPurchaseSelect={handlePurchaseSelect}
              onFetchOrderLines={fetchOrderLinesForTooltip}
              isLoading={isLoading}
            />
          </div>

          {/* Calendar */}
          <div className="flex-1 flex flex-col">
            <ProductionCalendar
              productionLines={productionLines}
              plannedProduction={weekPlannedProduction}
              holidays={holidays}
              weekDays={weekDays}
              selectedPlanned={selectedPlanned}
              onPurchaseDrop={handlePurchaseDrop}
              onPlannedMove={handlePlannedMove}
              onPlannedRightClick={handlePlannedRightClick}
              onPlannedSelect={handlePlannedSelect}
              onMovePlannedToSidebar={handleMovePlannedToSidebar}
              onSplitPlanned={handleSplitPlanned}
            />
          </div>
        </div>

        {/* Dialogs */}
        <ProductionLineManager
          isOpen={showLineManager}
          onClose={() => setShowLineManager(false)}
          productionLines={productionLines}
          onCreateLine={createProductionLine}
          onUpdateCapacity={updateProductionLineCapacity}
        />

        <OverlapDialog
          isOpen={overlapDialog.show}
          onClose={() => setOverlapDialog({ show: false })}
          targetPlanned={overlapDialog.targetPlanned}
          draggedPurchase={overlapDialog.draggedPurchase}
          position={overlapDialog.position}
          onConfirm={async (choice) => {
            // Handle overlap resolution
            console.log('Overlap choice:', choice);
            setOverlapDialog({ show: false });
          }}
        />

        <SplitDialog
          isOpen={splitDialog.show}
          onClose={() => setSplitDialog({ show: false, availableLines: productionLines })}
          plannedProduction={splitDialog.plannedProduction}
          availableLines={splitDialog.availableLines}
          onConfirm={async (splits) => {
            // Handle splitting
            console.log('Split confirmed:', splits);
            setSplitDialog({ show: false, availableLines: productionLines });
          }}
        />
      </div>
    </DndProvider>
  );
};