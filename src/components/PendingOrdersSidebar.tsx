
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Order } from '../types/scheduler';
import { Package, Scissors, Target, Search } from 'lucide-react';

interface PendingOrdersSidebarProps {
  orders: Order[];
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
}

export const PendingOrdersSidebar: React.FC<PendingOrdersSidebarProps> = ({
  orders,
  onOrderSplit
}) => {
  const [splitQuantities, setSplitQuantities] = useState<{ [orderId: string]: number }>({});
  const [searchTerm, setSearchTerm] = useState('');

  // Filter orders based on search term
  const filteredOrders = orders.filter(order =>
    order.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.styleId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSplit = (orderId: string) => {
    const quantity = splitQuantities[orderId];
    if (quantity && quantity > 0) {
      onOrderSplit(orderId, quantity);
      setSplitQuantities(prev => ({ ...prev, [orderId]: 0 }));
    }
  };

  const handleDragStart = (e: React.DragEvent, order: Order) => {
    e.dataTransfer.setData('application/json', JSON.stringify(order));
    e.dataTransfer.effectAllowed = 'move';
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
            className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
            draggable
            onDragStart={(e) => handleDragStart(e, order)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{order.poNumber}</CardTitle>
                <Badge variant="outline">{order.styleId}</Badge>
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
                    Split Order
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Split Order {order.poNumber}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
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
            <p className="text-sm">All orders have been scheduled</p>
          </div>
        )}
      </div>
    </div>
  );
};
