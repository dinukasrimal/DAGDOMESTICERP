
import { useState, useCallback } from "react";
import { Order, ProductionLine } from "../types/scheduler";

export interface OverlapDialogState {
  isOpen: boolean;
  newOrder: Order | null;
  overlappingOrders: Order[];
  targetDate: Date | null;
  targetLine: string;
  originalTargetDate: Date | null;
}

export function useHandleOverlapDialog(
  productionLines: ProductionLine[],
  getOverlappingOrders: (order: Order, lineId: string, date: Date) => Order[],
  onOrderMovedToPending: (order: Order) => Promise<void>,
  setScheduleDialog: (sd: any) => void,
  setPendingReschedule: (v: any) => void
) {
  const [overlapDialog, setOverlapDialog] = useState<OverlapDialogState>({
    isOpen: false, newOrder: null, overlappingOrders: [],
    targetDate: null, targetLine: '', originalTargetDate: null
  });

  const handleDrop = useCallback(
    (e: React.DragEvent, lineId: string, date: Date) => {
      e.preventDefault();
      try {
        const orderData = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (orderData && orderData.id && orderData.poNumber) {
          const overlappingOrders = getOverlappingOrders(orderData, lineId, date);
          const lineName = productionLines.find(l => l.id === lineId)?.name || 'Unknown Line';
          if (overlappingOrders.length > 0) {
            setOverlapDialog({
              isOpen: true,
              newOrder: orderData,
              overlappingOrders,
              targetDate: date,
              targetLine: lineName,
              originalTargetDate: date
            });
          } else {
            setScheduleDialog({
              isOpen: true,
              order: orderData,
              lineId,
              startDate: date
            });
          }
        }
      } catch (error) {
        console.error('❌ Failed to parse dropped order data:', error);
      }
    },
    [getOverlappingOrders, setScheduleDialog, productionLines]
  );

  // Return state, setter and specialized drop handler (all wiring for consumer)
  return {
    overlapDialog,
    setOverlapDialog,
    handleDrop,
  };
}
