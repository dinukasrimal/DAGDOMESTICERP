import React, { useState, useRef, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { 
  Package, 
  ArrowLeft, 
  Split, 
  MoreVertical,
  Trash2
} from 'lucide-react';

import type { PlannedProduction } from '@/types/planning';

interface PlannedProductionCardProps {
  planned: PlannedProduction;
  isSelected: boolean;
  onSelect: (isMultiSelect: boolean) => void;
  onRightClick: (event: React.MouseEvent) => void;
  onMoveToSidebar: () => void;
  onSplit: () => void;
}

interface ContextMenuProps {
  show: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onMoveToSidebar: () => void;
  onSplit: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ 
  show, 
  x, 
  y, 
  onClose, 
  onMoveToSidebar, 
  onSplit 
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (show) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[150px]"
      style={{ 
        left: `${x}px`, 
        top: `${y}px`,
        transform: 'translateX(-50%)'
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-left px-3 py-2 text-sm hover:bg-gray-100"
        onClick={() => {
          onMoveToSidebar();
          onClose();
        }}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Move back to sidebar
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-left px-3 py-2 text-sm hover:bg-gray-100"
        onClick={() => {
          onSplit();
          onClose();
        }}
      >
        <Split className="h-4 w-4 mr-2" />
        Split order
      </Button>
    </div>
  );
};

export const PlannedProductionCard: React.FC<PlannedProductionCardProps> = ({
  planned,
  isSelected,
  onSelect,
  onRightClick,
  onMoveToSidebar,
  onSplit
}) => {
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0 });

  const [{ isDragging }, drag] = useDrag({
    type: 'planned_production',
    item: planned,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    const isMultiSelect = event.ctrlKey || event.metaKey;
    onSelect(isMultiSelect);
  };

  const handleRightClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      show: true,
      x: event.clientX,
      y: event.clientY
    });
    
    onRightClick(event);
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ show: false, x: 0, y: 0 });
  };

  return (
    <>
      <Card
        ref={drag}
        className={cn(
          'p-2 cursor-pointer transition-all duration-200 border',
          {
            'opacity-50 scale-95': isDragging,
            'border-blue-500 bg-blue-50 shadow-md': isSelected,
            'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm': !isSelected,
          }
        )}
        onClick={handleClick}
        onContextMenu={handleRightClick}
      >
        <div className="space-y-1">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <Package className="h-3 w-3 text-gray-500" />
              <span className="font-medium text-xs text-gray-900 truncate">
                {planned.purchase_id}
              </span>
            </div>
            <MoreVertical className="h-3 w-3 text-gray-400" />
          </div>

          {/* Quantity */}
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs px-1 py-0">
              {planned.planned_quantity.toLocaleString()}
            </Badge>
            <span className="text-xs text-gray-500">
              {planned.status}
            </span>
          </div>
        </div>
      </Card>

      <ContextMenu
        show={contextMenu.show}
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={handleCloseContextMenu}
        onMoveToSidebar={onMoveToSidebar}
        onSplit={onSplit}
      />
    </>
  );
};