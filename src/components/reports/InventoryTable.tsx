
import React, { memo, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface InventoryItem {
  id: string;
  product_name: string;
  product_category: string;
  quantity_on_hand: number;
  quantity_available: number;
  virtual_available: number;
  reorder_min: number;
  reorder_max: number;
  cost: number;
  incoming_qty: number;
  outgoing_qty: number;
}

interface InventoryTableProps {
  data: InventoryItem[];
  expandedCategories: Set<string>;
  hiddenCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  onToggleVisibility: (category: string) => void;
}

const CategoryRow = memo(({ 
  category, 
  items, 
  isExpanded, 
  isHidden, 
  onToggle, 
  onToggleVisibility 
}: {
  category: string;
  items: InventoryItem[];
  isExpanded: boolean;
  isHidden: boolean;
  onToggle: () => void;
  onToggleVisibility: () => void;
}) => {
  const totals = useMemo(() => ({
    onHand: items.reduce((sum, item) => sum + (item.quantity_on_hand || 0), 0),
    available: items.reduce((sum, item) => sum + (item.quantity_available || 0), 0),
    virtual: items.reduce((sum, item) => sum + (item.virtual_available || 0), 0),
    value: items.reduce((sum, item) => sum + ((item.quantity_on_hand || 0) * (item.cost || 0)), 0),
    incoming: items.reduce((sum, item) => sum + (item.incoming_qty || 0), 0),
    outgoing: items.reduce((sum, item) => sum + (item.outgoing_qty || 0), 0),
  }), [items]);

  if (isHidden) return null;

  return (
    <>
      <TableRow className="bg-blue-50 font-semibold hover:bg-blue-100">
        <TableCell className="font-bold">
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="p-1 h-6 w-6"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <span>{category || 'Uncategorized'}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleVisibility}
              className="ml-2 h-6 px-2 text-xs"
            >
              Hide
            </Button>
          </div>
        </TableCell>
        <TableCell className="text-right font-bold">{totals.onHand.toFixed(2)}</TableCell>
        <TableCell className="text-right font-bold">{totals.available.toFixed(2)}</TableCell>
        <TableCell className="text-right font-bold">{totals.virtual.toFixed(2)}</TableCell>
        <TableCell className="text-right font-bold">LKR {totals.value.toLocaleString()}</TableCell>
        <TableCell className="text-right font-bold">{totals.incoming.toFixed(2)}</TableCell>
        <TableCell className="text-right font-bold">{totals.outgoing.toFixed(2)}</TableCell>
        <TableCell></TableCell>
        <TableCell></TableCell>
      </TableRow>
      {isExpanded && items.map((item) => (
        <ProductRow key={item.id} item={item} />
      ))}
    </>
  );
});

const ProductRow = memo(({ item }: { item: InventoryItem }) => (
  <TableRow className="hover:bg-gray-50">
    <TableCell className="pl-12">{item.product_name}</TableCell>
    <TableCell className="text-right">{(item.quantity_on_hand || 0).toFixed(2)}</TableCell>
    <TableCell className="text-right">{(item.quantity_available || 0).toFixed(2)}</TableCell>
    <TableCell className="text-right">{(item.virtual_available || 0).toFixed(2)}</TableCell>
    <TableCell className="text-right">
      LKR {((item.quantity_on_hand || 0) * (item.cost || 0)).toLocaleString()}
    </TableCell>
    <TableCell className="text-right">{(item.incoming_qty || 0).toFixed(2)}</TableCell>
    <TableCell className="text-right">{(item.outgoing_qty || 0).toFixed(2)}</TableCell>
    <TableCell className="text-right">{(item.reorder_min || 0).toFixed(2)}</TableCell>
    <TableCell className="text-right">{(item.reorder_max || 0).toFixed(2)}</TableCell>
  </TableRow>
));

export const InventoryTable = memo(({ 
  data, 
  expandedCategories, 
  hiddenCategories, 
  onToggleCategory, 
  onToggleVisibility 
}: InventoryTableProps) => {
  const groupedData = useMemo(() => {
    const groups = new Map<string, InventoryItem[]>();
    
    data.forEach(item => {
      const category = item.product_category || 'Uncategorized';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(item);
    });
    
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-bold">Product / Category</TableHead>
            <TableHead className="text-right font-bold">On Hand</TableHead>
            <TableHead className="text-right font-bold">Available</TableHead>
            <TableHead className="text-right font-bold">Virtual</TableHead>
            <TableHead className="text-right font-bold">Value</TableHead>
            <TableHead className="text-right font-bold">Incoming</TableHead>
            <TableHead className="text-right font-bold">Outgoing</TableHead>
            <TableHead className="text-right font-bold">Min</TableHead>
            <TableHead className="text-right font-bold">Max</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedData.map(([category, items]) => (
            <CategoryRow
              key={category}
              category={category}
              items={items}
              isExpanded={expandedCategories.has(category)}
              isHidden={hiddenCategories.has(category)}
              onToggle={() => onToggleCategory(category)}
              onToggleVisibility={() => onToggleVisibility(category)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
});

CategoryRow.displayName = 'CategoryRow';
ProductRow.displayName = 'ProductRow';
InventoryTable.displayName = 'InventoryTable';
