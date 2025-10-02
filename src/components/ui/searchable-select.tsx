import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface SearchableOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  allowCreate?: boolean;
  onCreateOption?: (label: string) => Promise<SearchableOption | null> | SearchableOption | null;
  createLabel?: (label: string) => string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  emptyLabel = 'No results found.',
  searchPlaceholder = 'Search...',
  disabled = false,
  className,
  allowCreate = false,
  onCreateOption,
  createLabel,
}) => {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const selectedOption = options.find(option => option.value === value);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const canCreate =
    allowCreate &&
    !disabled &&
    normalizedSearch.length > 0 &&
    !options.some(opt => opt.label.toLowerCase() === normalizedSearch || opt.value.toLowerCase() === normalizedSearch);

  React.useEffect(() => {
    if (!open) {
      setSearchTerm('');
    }
  }, [open]);

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setOpen(false);
    setSearchTerm('');
  };

  const handleCreateOption = async () => {
    if (!canCreate || !onCreateOption) return;
    const label = searchTerm.trim();
    if (!label) return;
    setIsCreating(true);
    try {
      const created = await onCreateOption(label);
      if (created) {
        onChange(created.value);
        setOpen(false);
        setSearchTerm('');
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={!disabled ? setOpen : undefined}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between min-h-10', className)}
          disabled={disabled}
        >
          <span className="truncate text-left">
            {selectedOption ? (
              <span className="flex flex-col text-left">
                <span>{selectedOption.label}</span>
                {selectedOption.description && (
                  <span className="text-xs text-muted-foreground truncate">
                    {selectedOption.description}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
        <Command filter={(value, search) => {
          const option = options.find(opt => opt.value === value);
          if (!option) return 0;
          const haystack = `${option.label} ${option.description ?? ''}`.toLowerCase();
          return haystack.includes(search.toLowerCase()) ? 1 : 0;
        }}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchTerm}
            onValueChange={setSearchTerm}
            onKeyDown={event => {
              if (event.key === 'Enter' && canCreate) {
                event.preventDefault();
                void handleCreateOption();
              }
            }}
          />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map(option => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={handleSelect}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.description && (
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem
                  value={`__create-${normalizedSearch}`}
                  disabled={isCreating}
                  onSelect={() => {
                    void handleCreateOption();
                  }}
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  <div className="flex flex-col">
                    <span>
                      {createLabel
                        ? createLabel(searchTerm.trim())
                        : `Add "${searchTerm.trim()}"`}
                    </span>
                    {isCreating && (
                      <span className="text-xs text-muted-foreground">Saving…</span>
                    )}
                  </div>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
