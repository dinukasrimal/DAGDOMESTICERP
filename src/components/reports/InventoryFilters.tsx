
import React, { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface InventoryFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  categories: string[];
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onShowAll: () => void;
}

export const InventoryFilters = memo(({
  searchTerm,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
  onExpandAll,
  onCollapseAll,
  onShowAll
}: InventoryFiltersProps) => {
  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full"
          />
        </div>
        
        <div className="min-w-[150px]">
          <Select value={selectedCategory} onValueChange={onCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Categories</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onExpandAll}
        >
          Expand All
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onCollapseAll}
        >
          Collapse All
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onShowAll}
        >
          Show All Categories
        </Button>
      </div>
    </div>
  );
});

InventoryFilters.displayName = 'InventoryFilters';
