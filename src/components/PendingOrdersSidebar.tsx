
import React, { useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogAction, AlertDialogCancel, AlertDialogFooter, AlertDialogDescription } from './ui/alert-dialog';
import { Order } from '../types/scheduler';
import { Package, Scissors, Target, Search, GripVertical, Trash } from 'lucide-react';

interface PendingOrdersSidebarProps {
  orders: Order[];
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
  onOrderDelete?: (orderId: string) => void;
}

export const PendingOrdersSidebar: React.FC<PendingOrdersSidebarProps> = ({
  orders,
  onOrderSplit,
  onOrderDelete
}) => {
  const [splitQuantities, setSplitQuantities] = useState<{ [orderId: string]: number }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedOrder, setDraggedOrder] = useState<string | null>(null);
  const [deleteDialogOrderId, setDeleteDialogOrderId] = useState<string | null>(null);

  // Filter orders based on search term
  const filteredOrders = orders.filter(order =>
    order.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.styleId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSplit = useCallback((orderId: string) => {
    const quantity = splitQuantities[orderId];
    if (quantity && quantity > 0) {
      onOrderSplit(orderId, quantity);
      setSplitQuantities(prev => ({ ...prev, [orderId]: 0 }));
    }
  }, [splitQuantities, onOrderSplit]);

  const handleDragStart = useCallback((e: React.DragEvent, order: Order) => {
    setDraggedOrder(order.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(order));
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedOrder(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleDelete = async (orderId: string) => {
    if (onOrderDelete) {
      await onOrderDelete(orderId);
    }
    setDeleteDialogOrderId(null);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Pending Orders</h2>
        <p className="text-sm text-muted-foreground">
          {orders.length} orders waiting to be scheduled
        </p>
        
        {/* Search Input */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PO or Style..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredOrders.map((order) => (
          <Card
            key={order.id}
            className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-all duration-200 border-2 ${
              draggedOrder === order.id 
                ? 'border-primary bg-primary/5' 
                : 'border-transparent hover:border-primary/20'
            }`}
            draggable
            onDragStart={(e) => handleDragStart(e, order)}
            onDragEnd={handleDragEnd}
          >
            {/* Card Header with PO number and delete button */}
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">{order.poNumber}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{order.styleId}</Badge>
                  {/* Delete button only for pending orders */}
                  {onOrderDelete && (
                    <>
                      <AlertDialog open={deleteDialogOrderId === order.id} onOpenChange={(open) => setDeleteDialogOrderId(open ? order.id : null)}>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete order"
                            className="ml-1 p-1 border-none bg-transparent hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            tabIndex={0}
                            onClick={e => {
                              e.stopPropagation();
                              setDeleteDialogOrderId(order.id);
                            }}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete Order <span className="font-bold">{order.poNumber}</span>?
                            </AlertDialogTitle>
                          </AlertDialogHeader>
                          <AlertDialogDescription>
                            Are you sure you want to permanently delete this order? This action cannot be undone.
                          </AlertDialogDescription>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              onClick={() => setDeleteDialogOrderId(null)}
                            >
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => handleDelete(order.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center space-x-1">
                  <Package className="h-3 w-3 text-muted-foreground" />
                  <span>Qty: {order.orderQuantity.toLocaleString()}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Target className="h-3 w-3 text-muted-foreground" />
                  <span>SMV: {order.smv}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Scissors className="h-3 w-3 text-muted-foreground" />
                  <span>Cut: {order.cutQuantity.toLocaleString()}</span>
                </div>
                <div className="text-muted-foreground">
                  <span>MO: {order.moCount}</span>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground">
                Issue Qty: {order.issueQuantity.toLocaleString()}
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    <Scissors className="h-3 w-3 mr-1" />
                    Split Order
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Split Order {order.poNumber}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="bg-muted/50 p-3 rounded">
                      <p className="text-sm">
                        <strong>Current Quantity:</strong> {order.orderQuantity.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Enter the quantity for the new split order. The remaining quantity will stay with the original order.
                      </p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium">Split Quantity:</label>
                      <Input
                        type="number"
                        min="1"
                        max={order.orderQuantity - 1}
                        value={splitQuantities[order.id] || ''}
                        onChange={(e) => setSplitQuantities(prev => ({
                          ...prev,
                          [order.id]: parseInt(e.target.value) || 0
                        }))}
                        placeholder={`Max: ${order.orderQuantity - 1}`}
                        className="mt-1"
                      />
                    </div>
                    
                    <Button
                      onClick={() => handleSplit(order.id)}
                      disabled={!splitQuantities[order.id] || splitQuantities[order.id] >= order.orderQuantity}
                      className="w-full"
                    >
                      Split Order
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
        
        {filteredOrders.length === 0 && searchTerm && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No orders found</p>
            <p className="text-sm">Try adjusting your search terms</p>
          </div>
        )}
        
        {orders.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No pending orders</p>
            <p className="text-sm">All orders have been scheduled or sync from Google Sheets</p>
          </div>
        )}
      </div>
    </div>
  );
};
