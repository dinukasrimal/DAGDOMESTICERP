import React from 'react';
import { useDrag } from 'react-dnd';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { 
  Package, 
  Calendar, 
  TrendingUp, 
  ChevronDown, 
  ChevronRight,
  Truck,
  Building
} from 'lucide-react';

import type { Purchase, PurchaseOrderLine } from '@/types/planning';

interface PurchaseOrderSidebarProps {
  purchases: Purchase[];
  orderLines: PurchaseOrderLine[];
  selectedPurchase: Purchase | null;
  onPurchaseSelect: (purchase: Purchase) => void;
  isLoading: boolean;
}

interface DraggablePurchaseProps {
  purchase: Purchase;
  isSelected: boolean;
  onSelect: (purchase: Purchase) => void;
}

const DraggablePurchase: React.FC<DraggablePurchaseProps> = ({ 
  purchase, 
  isSelected, 
  onSelect 
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'purchase',
    item: purchase,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const deliveryDate = purchase.delivery_date ? new Date(purchase.delivery_date) : null;
  const orderDate = new Date(purchase.order_date);
  const isUrgent = deliveryDate && deliveryDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return (
    <div
      ref={drag}
      className={`
        p-3 border rounded-lg cursor-pointer transition-all duration-200
        ${isDragging ? 'opacity-50 scale-95' : 'opacity-100'}
        ${isSelected 
          ? 'border-blue-500 bg-blue-50 shadow-md' 
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
        }
        ${isUrgent ? 'ring-2 ring-orange-200' : ''}
      `}
      onClick={() => onSelect(purchase)}
    >
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Package className="h-4 w-4 text-gray-500" />
            <span className="font-semibold text-sm text-gray-900">
              {purchase.po_number}
            </span>
          </div>
          {isUrgent && (
            <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
              Urgent
            </Badge>
          )}
        </div>

        {/* Supplier */}
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Building className="h-3 w-3" />
          <span className="truncate">{purchase.supplier}</span>
        </div>

        {/* Quantity */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm">
            <TrendingUp className="h-3 w-3 text-gray-500" />
            <span className="font-medium text-gray-900">
              {purchase.total_quantity.toLocaleString()} units
            </span>
          </div>
        </div>

        {/* Dates */}
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <Calendar className="h-3 w-3" />
            <span>Ordered: {format(orderDate, 'MMM d, yyyy')}</span>
          </div>
          {deliveryDate && (
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <Truck className="h-3 w-3" />
              <span className={isUrgent ? 'text-orange-600 font-medium' : ''}>
                Delivery: {format(deliveryDate, 'MMM d, yyyy')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface OrderLineItemProps {
  orderLine: PurchaseOrderLine;
}

const OrderLineItem: React.FC<OrderLineItemProps> = ({ orderLine }) => {
  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-gray-900">
            {orderLine.product_name}
          </span>
          <Badge variant="outline" className="text-xs">
            {orderLine.quantity.toLocaleString()}
          </Badge>
        </div>
        
        {orderLine.specifications && (
          <p className="text-xs text-gray-600 leading-relaxed">
            {orderLine.specifications}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Unit: ${orderLine.unit_price?.toFixed(2) || '0.00'}</span>
          <span className="font-medium">
            Total: ${orderLine.total_price?.toFixed(2) || '0.00'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const PurchaseOrderSidebar: React.FC<PurchaseOrderSidebarProps> = ({
  purchases,
  orderLines,
  selectedPurchase,
  onPurchaseSelect,
  isLoading
}) => {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <CardHeader className="flex-shrink-0 pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Package className="h-5 w-5 text-blue-600" />
            <span>Purchase Orders</span>
          </div>
          <Badge variant="secondary">{purchases.length}</Badge>
        </CardTitle>
        <p className="text-sm text-gray-600">
          Drag orders to the calendar to plan production
        </p>
      </CardHeader>

      {/* Purchase Orders List */}
      <CardContent className="flex-1 flex flex-col pt-0">
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : purchases.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-sm">No purchase orders available</p>
              <p className="text-gray-400 text-xs mt-1">
                All orders are either planned or on hold
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {purchases.map((purchase) => (
                <DraggablePurchase
                  key={purchase.id}
                  purchase={purchase}
                  isSelected={selectedPurchase?.id === purchase.id}
                  onSelect={onPurchaseSelect}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Selected Purchase Details */}
        {selectedPurchase && (
          <>
            <Separator className="my-4" />
            <div className="flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm text-gray-900">Order Details</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPurchaseSelect(selectedPurchase)}
                  className="h-6 px-2"
                >
                  {orderLines.length > 0 ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
              </div>

              {orderLines.length > 0 && (
                <ScrollArea className="max-h-64">
                  <div className="space-y-2">
                    {orderLines.map((orderLine) => (
                      <OrderLineItem key={orderLine.id} orderLine={orderLine} />
                    ))}
                  </div>
                </ScrollArea>
              )}

              {orderLines.length === 0 && (
                <div className="text-center py-6">
                  <div className="text-xs text-gray-500">
                    Click to load order line details
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </div>
  );
};