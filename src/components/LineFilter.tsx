
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { ProductionLine, LineGroup } from '../types/scheduler';
import { Move, ChevronDown, Filter, ChevronRight, Plus, Users, Settings } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { toast } from './ui/use-toast';

interface LineFilterProps {
  productionLines: ProductionLine[];
  selectedLineIds: string[];
  onLineToggle: (lineId: string, checked: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onLineReorder?: (reorderedLines: ProductionLine[]) => void;
  lineGroups?: LineGroup[];
  onGroupToggle?: (groupId: string, isExpanded: boolean) => void;
  onGroupCreate?: (groupName: string, lineIds: string[]) => void;
  onGroupDelete?: (groupId: string) => void;
  onLineGroupAssign?: (lineId: string, groupId: string | null) => void;
}

export const LineFilter: React.FC<LineFilterProps> = ({
  productionLines,
  selectedLineIds,
  onLineToggle,
  onSelectAll,
  onDeselectAll,
  onLineReorder,
  lineGroups = [],
  onGroupToggle,
  onGroupCreate,
  onGroupDelete,
  onLineGroupAssign
}) => {
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null);
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedLinesForGroup, setSelectedLinesForGroup] = useState<string[]>([]);
  const [showManageGroups, setShowManageGroups] = useState(false);

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

  // Group lines by their group assignment
  const groupedLines = React.useMemo(() => {
    const ungroupedLines: ProductionLine[] = [];
    const groupedMap = new Map<string, ProductionLine[]>();

    productionLines.forEach(line => {
      if (line.groupId) {
        if (!groupedMap.has(line.groupId)) {
          groupedMap.set(line.groupId, []);
        }
        groupedMap.get(line.groupId)!.push(line);
      } else {
        ungroupedLines.push(line);
      }
    });

    return { ungroupedLines, groupedMap };
  }, [productionLines]);

  const handleCreateGroup = () => {
    if (newGroupName.trim() && selectedLinesForGroup.length > 0 && onGroupCreate) {
      onGroupCreate(newGroupName.trim(), selectedLinesForGroup);
      setNewGroupName('');
      setSelectedLinesForGroup([]);
      setShowGroupDialog(false);
      toast({
        title: "Group Created",
        description: `Group "${newGroupName.trim()}" created with ${selectedLinesForGroup.length} lines.`
      });
    }
  };

  const handleGroupToggle = (groupId: string) => {
    const group = lineGroups.find(g => g.id === groupId);
    if (group && onGroupToggle) {
      onGroupToggle(groupId, !group.isExpanded);
    }
  };

  const handleRemoveFromGroup = (lineId: string) => {
    if (onLineGroupAssign) {
      onLineGroupAssign(lineId, null);
    }
  };

  const handleDeleteGroup = (groupId: string) => {
    if (onGroupDelete) {
      onGroupDelete(groupId);
    }
  };

  const renderGroupedLines = () => {
    const elements: React.ReactNode[] = [];
    
    // Render groups first
    lineGroups.forEach(group => {
      const groupLines = groupedLines.groupedMap.get(group.id) || [];
      const groupSelectedCount = groupLines.filter(line => selectedLineIds.includes(line.id)).length;
      
      elements.push(
        <div key={group.id} className="border rounded-lg mb-2">
          <div className="flex items-center justify-between p-2 bg-muted/50 rounded-t-lg">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleGroupToggle(group.id)}
                className="p-0 h-6 w-6"
              >
                {group.isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">{group.name}</span>
              <Badge variant="outline" className="text-xs">
                {groupSelectedCount}/{groupLines.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const allGroupSelected = groupLines.every(line => selectedLineIds.includes(line.id));
                  groupLines.forEach(line => {
                    onLineToggle(line.id, !allGroupSelected);
                  });
                }}
                className="text-xs px-2 h-6"
              >
                {groupSelectedCount === groupLines.length ? 'Deselect All' : 'Select All'}
              </Button>
              {showManageGroups && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteGroup(group.id)}
                  className="text-xs px-2 h-6 text-destructive"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
          
          {group.isExpanded && (
            <div className="p-1 space-y-1">
              {groupLines.map((line) => (
                <div
                  key={line.id}
                  className={`flex items-center space-x-3 p-2 rounded hover:bg-accent transition-colors ${
                    dragOverLineId === line.id ? 'bg-blue-50 border border-blue-200' : ''
                  } ${draggedLineId === line.id ? 'opacity-50' : ''}`}
                  draggable={!!onLineReorder}
                  onDragStart={(e) => handleDragStart(e, line.id)}
                  onDragOver={(e) => handleDragOver(e, line.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, line.id)}
                  onDragEnd={handleDragEnd}
                >
                  {onLineReorder && (
                    <Move className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                  )}
                  <Checkbox
                    id={`line-${line.id}`}
                    checked={selectedLineIds.includes(line.id)}
                    onCheckedChange={(checked) => onLineToggle(line.id, !!checked)}
                  />
                  <label
                    htmlFor={`line-${line.id}`}
                    className="text-sm font-medium cursor-pointer flex-1 min-w-0"
                  >
                    {line.name}
                  </label>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {line.capacity}
                  </Badge>
                  {showManageGroups && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFromGroup(line.id)}
                      className="text-xs px-2 h-6 text-muted-foreground"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });
    
    // Render ungrouped lines
    if (groupedLines.ungroupedLines.length > 0) {
      elements.push(
        <div key="ungrouped" className="space-y-1">
          {groupedLines.ungroupedLines.length > 0 && lineGroups.length > 0 && (
            <div className="text-xs text-muted-foreground px-2 py-1 font-medium">
              Ungrouped Lines
            </div>
          )}
          {groupedLines.ungroupedLines.map((line) => (
            <div
              key={line.id}
              className={`flex items-center space-x-3 p-2 rounded hover:bg-accent transition-colors ${
                dragOverLineId === line.id ? 'bg-blue-50 border border-blue-200' : ''
              } ${draggedLineId === line.id ? 'opacity-50' : ''}`}
              draggable={!!onLineReorder}
              onDragStart={(e) => handleDragStart(e, line.id)}
              onDragOver={(e) => handleDragOver(e, line.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, line.id)}
              onDragEnd={handleDragEnd}
            >
              {onLineReorder && (
                <Move className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
              )}
              <Checkbox
                id={`line-${line.id}`}
                checked={selectedLineIds.includes(line.id)}
                onCheckedChange={(checked) => onLineToggle(line.id, !!checked)}
              />
              <label
                htmlFor={`line-${line.id}`}
                className="text-sm font-medium cursor-pointer flex-1 min-w-0"
              >
                {line.name}
              </label>
              <Badge variant="outline" className="text-xs flex-shrink-0">
                {line.capacity}
              </Badge>
            </div>
          ))}
        </div>
      );
    }
    
    return elements;
  };
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <span>Production Lines</span>
          <Badge variant="secondary" className="ml-2">
            {selectedLineIds.length}/{productionLines.length}
          </Badge>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-sm">Production Lines</span>
            <Badge variant="secondary">
              {selectedLineIds.length} of {productionLines.length} selected
            </Badge>
          </div>
          <div className="flex gap-2 mb-3">
            <Button
              onClick={onSelectAll}
              variant="outline"
              size="sm"
              disabled={allSelected}
              className="flex-1"
            >
              Select All
            </Button>
            <Button
              onClick={onDeselectAll}
              variant="outline"
              size="sm"
              disabled={!someSelected}
              className="flex-1"
            >
              Deselect All
            </Button>
          </div>
          
          {onGroupCreate && (
            <div className="flex gap-2">
              <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Plus className="h-4 w-4 mr-1" />
                    Create Group
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Line Group</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Group Name</label>
                      <Input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Enter group name"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Select Lines</label>
                      <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-2">
                        {productionLines.filter(line => !line.groupId).map(line => (
                          <div key={line.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`group-line-${line.id}`}
                              checked={selectedLinesForGroup.includes(line.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedLinesForGroup(prev => [...prev, line.id]);
                                } else {
                                  setSelectedLinesForGroup(prev => prev.filter(id => id !== line.id));
                                }
                              }}
                            />
                            <label htmlFor={`group-line-${line.id}`} className="text-sm cursor-pointer">
                              {line.name}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button
                        onClick={handleCreateGroup}
                        disabled={!newGroupName.trim() || selectedLinesForGroup.length === 0}
                        className="flex-1"
                      >
                        Create Group
                      </Button>
                      <Button
                        onClick={() => {
                          setShowGroupDialog(false);
                          setNewGroupName('');
                          setSelectedLinesForGroup([]);
                        }}
                        variant="outline"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button
                onClick={() => setShowManageGroups(!showManageGroups)}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <Settings className="h-4 w-4 mr-1" />
                {showManageGroups ? 'Done' : 'Manage'}
              </Button>
            </div>
          )}
        </div>
        
        <div className="max-h-80 overflow-y-auto">
          <div className="p-2 space-y-1">
            {renderGroupedLines()}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
