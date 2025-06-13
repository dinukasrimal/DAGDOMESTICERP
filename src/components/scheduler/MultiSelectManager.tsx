
import React from 'react';
import { Button } from '../ui/button';
import { CheckSquare, Square, X } from 'lucide-react';

interface MultiSelectManagerProps {
  isMultiSelectMode: boolean;
  selectedCount: number;
  onToggleMultiSelect: () => void;
  onClearSelection: () => void;
}

export const MultiSelectManager: React.FC<MultiSelectManagerProps> = ({
  isMultiSelectMode,
  selectedCount,
  onToggleMultiSelect,
  onClearSelection
}) => {
  return (
    <div className="sticky top-0 z-30 bg-background border-b border-border p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            onClick={onToggleMultiSelect}
            variant={isMultiSelectMode ? "default" : "outline"}
            size="sm"
            className="flex items-center space-x-2"
          >
            {isMultiSelectMode ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            <span>Multi-Select</span>
          </Button>
          
          {isMultiSelectMode && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <span>{selectedCount} orders selected</span>
              {selectedCount > 0 && (
                <Button
                  onClick={onClearSelection}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
        
        {isMultiSelectMode && (
          <div className="text-xs text-muted-foreground">
            Select orders to drag multiple at once
          </div>
        )}
      </div>
    </div>
  );
};
