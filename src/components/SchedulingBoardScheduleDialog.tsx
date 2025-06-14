
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { Order, ProductionLine, RampUpPlan } from "../types/scheduler";

interface SchedulingBoardScheduleDialogProps {
  isOpen: boolean;
  order: Order | null;
  lineId: string;
  startDate: Date | null;
  productionLines: ProductionLine[];
  planningMethod: "capacity" | "rampup";
  setPlanningMethod: (method: "capacity" | "rampup") => void;
  rampUpPlans: RampUpPlan[];
  selectedRampUpPlanId: string;
  setSelectedRampUpPlanId: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  disableConfirm?: boolean;
}

export const SchedulingBoardScheduleDialog: React.FC<SchedulingBoardScheduleDialogProps> = ({
  isOpen, order, lineId, startDate, productionLines,
  planningMethod, setPlanningMethod, rampUpPlans, selectedRampUpPlanId, setSelectedRampUpPlanId,
  onConfirm, onCancel, disableConfirm
}) => (
  <Dialog open={isOpen} onOpenChange={open => !open && onCancel()}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Schedule Order</DialogTitle>
      </DialogHeader>
      {order && (
        <div className="space-y-4">
          <div className="bg-muted/50 p-3 rounded">
            <h3 className="font-medium">{order.poNumber}</h3>
            <p className="text-sm text-muted-foreground">
              Style: {order.styleId}
            </p>
            <p className="text-sm text-muted-foreground">
              Quantity: {order.orderQuantity.toLocaleString()} | SMV: {order.smv} | MO: {order.moCount}
            </p>
            <p className="text-sm text-muted-foreground">
              Cut: {order.cutQuantity.toLocaleString()} | Issue: {order.issueQuantity.toLocaleString()}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="font-medium">Start Date:</label>
              <div>{startDate?.toLocaleDateString()}</div>
            </div>
            <div>
              <label className="font-medium">Production Line:</label>
              <div>{productionLines.find(l => l.id === lineId)?.name}</div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Planning Method:</label>
            <RadioGroup value={planningMethod} onValueChange={setPlanningMethod as any}>
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
          {planningMethod === "rampup" && (
            <div>
              <label className="text-sm font-medium">Ramp-Up Plan:</label>
              <Select value={selectedRampUpPlanId} onValueChange={setSelectedRampUpPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a ramp-up plan" />
                </SelectTrigger>
                <SelectContent>
                  {rampUpPlans.map(plan => (
                    <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex space-x-2 pt-4">
            <Button disabled={disableConfirm} onClick={onConfirm} className="flex-1">
              Schedule Order
            </Button>
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

export default SchedulingBoardScheduleDialog;
