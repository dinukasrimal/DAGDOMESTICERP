
import React from 'react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { ChevronDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { ProductionLine } from '../types/scheduler';

interface LineFilterProps {
  productionLines: ProductionLine[];
  selectedLineIds: string[];
  onLineToggle: (lineId: string, checked: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export const LineFilter: React.FC<LineFilterProps> = ({
  productionLines,
  selectedLineIds,
  onLineToggle,
  onSelectAll,
  onDeselectAll
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSelectAll = () => {
    onSelectAll();
  };

  const handleDeselectAll = () => {
    onDeselectAll();
  };

  const getButtonText = () => {
    if (selectedLineIds.length === productionLines.length) {
      return "All Lines Selected";
    } else if (selectedLineIds.length === 0) {
      return "No Lines Selected";
    } else {
      return `${selectedLineIds.length} Lines Selected`;
    }
  };

  return (
    <div className="flex items-center gap-4">
      <label className="text-sm font-medium text-muted-foreground">
        Show Lines:
      </label>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-64 justify-between">
            {getButtonText()}
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-4 space-y-4">
            <div className="text-sm font-medium">Select Production Lines</div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                className="flex-1"
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                className="flex-1"
              >
                Deselect All
              </Button>
            </div>
            
            <div className="border-t pt-4">
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {productionLines.map(line => (
                  <div key={line.id} className="flex items-center space-x-3">
                    <Checkbox
                      id={line.id}
                      checked={selectedLineIds.includes(line.id)}
                      onCheckedChange={(checked) => onLineToggle(line.id, checked as boolean)}
                    />
                    <label
                      htmlFor={line.id}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {line.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <span className="text-xs text-muted-foreground">
        {selectedLineIds.length === productionLines.length 
          ? `Showing all ${productionLines.length} lines`
          : `Showing ${selectedLineIds.length} of ${productionLines.length} lines`
        }
      </span>
    </div>
  );
};
