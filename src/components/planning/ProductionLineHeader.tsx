import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Factory, 
  Settings, 
  Power,
  PowerOff
} from 'lucide-react';

import type { ProductionLine } from '@/types/planning';

interface ProductionLineHeaderProps {
  line: ProductionLine;
  onEdit?: (line: ProductionLine) => void;
  onToggleActive?: (lineId: string, isActive: boolean) => void;
}

export const ProductionLineHeader: React.FC<ProductionLineHeaderProps> = ({
  line,
  onEdit,
  onToggleActive
}) => {
  return (
    <div className={cn(
      'sticky left-0 bg-white border-r border-b border-gray-200 p-3 flex items-center justify-between min-w-[200px] z-10',
      {
        'bg-gray-50': !line.is_active
      }
    )}>
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <Factory className={cn(
            'h-4 w-4',
            line.is_active ? 'text-blue-600' : 'text-gray-400'
          )} />
          <div>
            <div className="font-medium text-sm text-gray-900">
              {line.name}
            </div>
            {line.description && (
              <div className="text-xs text-gray-500 truncate max-w-[100px]">
                {line.description}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Badge 
            variant="outline" 
            className={cn(
              'text-xs',
              line.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
            )}
          >
            {line.capacity} units/day
          </Badge>
          
          <Badge 
            variant={line.is_active ? 'default' : 'secondary'}
            className="text-xs"
          >
            {line.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      <div className="flex items-center space-x-1">
        {onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(line)}
            className="h-7 w-7 p-0"
          >
            <Settings className="h-3 w-3" />
          </Button>
        )}
        
        {onToggleActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleActive(line.id, !line.is_active)}
            className="h-7 w-7 p-0"
          >
            {line.is_active ? (
              <PowerOff className="h-3 w-3 text-orange-600" />
            ) : (
              <Power className="h-3 w-3 text-green-600" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
};