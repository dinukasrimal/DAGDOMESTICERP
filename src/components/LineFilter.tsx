import React, { useState } from 'react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ProductionLine } from '../types/scheduler';
import { Move } from 'lucide-react';

interface LineFilterProps {
  productionLines: ProductionLine[];
  selectedLineIds: string[];
  onLineToggle: (lineId: string, checked: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onLineReorder?: (reorderedLines: ProductionLine[]) => void;
}

export const LineFilter: React.FC<LineFilterProps> = ({
  productionLines,
  selectedLineIds,
  onLineToggle,
  onSelectAll,
  onDeselectAll,
  onLineReorder
}) => {
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null);
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, lineId: string) => {
    setDraggedLineId(lineId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, lineId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverLineId(lineId);
  };

  const handleDragLeave = () => {
    setDragOverLineId(null);
  };

  const handleDrop = (e: React.DragEvent, targetLineId: string) => {
    e.preventDefault();
    
    if (!draggedLineId || draggedLineId === targetLineId || !onLineReorder) {
      setDraggedLineId(null);
      setDragOverLineId(null);
      return;
    }

    const draggedIndex = productionLines.findIndex(line => line.id === draggedLineId);
    const targetIndex = productionLines.findIndex(line => line.id === targetLineId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedLineId(null);
      setDragOverLineId(null);
      return;
    }

    const newLines = [...productionLines];
    const draggedLine = newLines[draggedIndex];
    
    // Remove dragged line
    newLines.splice(draggedIndex, 1);
    
    // Insert at new position
    const insertIndex = draggedIndex < targetIndex ? targetIndex : targetIndex + 1;
    newLines.splice(insertIndex, 0, draggedLine);

    onLineReorder(newLines);
    setDraggedLineId(null);
    setDragOverLineId(null);
  };

  const handleDragEnd = () => {
    setDraggedLineId(null);
    setDragOverLineId(null);
  };

  const allSelected = selectedLineIds.length === productionLines.length;
  const someSelected = selectedLineIds.length > 0;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Production Lines</span>
          <Badge variant="secondary">
            {selectedLineIds.length} of {productionLines.length} selected
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button
            onClick={onSelectAll}
            variant="outline"
            size="sm"
            disabled={allSelected}
          >
            Select All
          </Button>
          <Button
            onClick={onDeselectAll}
            variant="outline"
            size="sm"
            disabled={!someSelected}
          >
            Deselect All
          </Button>
        </div>
        
        <div className="space-y-2">
          {productionLines.map((line) => (
            <div
              key={line.id}
              className={`flex items-center space-x-3 p-2 rounded border ${
                dragOverLineId === line.id ? 'border-blue-400 bg-blue-50' : 'border-border'
              } ${draggedLineId === line.id ? 'opacity-50' : ''}`}
              draggable={!!onLineReorder}
              onDragStart={(e) => handleDragStart(e, line.id)}
              onDragOver={(e) => handleDragOver(e, line.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, line.id)}
              onDragEnd={handleDragEnd}
            >
              {onLineReorder && (
                <Move className="h-4 w-4 text-muted-foreground cursor-grab" />
              )}
              <Checkbox
                id={`line-${line.id}`}
                checked={selectedLineIds.includes(line.id)}
                onCheckedChange={(checked) => onLineToggle(line.id, !!checked)}
              />
              <label
                htmlFor={`line-${line.id}`}
                className="text-sm font-medium cursor-pointer flex-1"
              >
                {line.name}
              </label>
              <Badge variant="outline" className="text-xs">
                {line.capacity}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
