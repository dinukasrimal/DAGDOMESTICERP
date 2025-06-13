
import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useToast } from './ui/use-toast';
import { useSupabaseProductionData } from '../hooks/useSupabaseProductionData';
import { ProductionLine, Holiday } from '../types/scheduler';
import { format } from 'date-fns';

export const AdminPanel = () => {
  const [newProductionLine, setNewProductionLine] = useState({ name: '', capacity: 0 });
  const [newHoliday, setNewHoliday] = useState<{
    name: string;
    date: string;
    isGlobal: boolean;
    affectedLineIds: string[];
  }>({
    name: '',
    date: '',
    isGlobal: true,
    affectedLineIds: []
  });
  const [selectedLinesForHoliday, setSelectedLinesForHoliday] = useState<string[]>([]);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const { toast } = useToast();

  const {
    productionLines,
    holidays,
    createHolidayWithImpactCheck,
    createProductionLine
  } = useSupabaseProductionData();

  const handleCreateLine = async () => {
    if (!newProductionLine.name || !newProductionLine.capacity) {
      console.log('Missing line name or capacity');
      return;
    }

    try {
      const capacity = parseInt(newProductionLine.capacity.toString(), 10);
      await createProductionLine({ name: newProductionLine.name, capacity: capacity });
      setNewProductionLine({ name: '', capacity: 0 });
      toast({
        title: 'Success',
        description: 'Production line created successfully.',
      });
    } catch (error) {
      console.error('Failed to create production line:', error);
      toast({
        title: 'Error',
        description: 'Failed to create production line.',
      });
    }
  };

  const handleCreateHoliday = async () => {
    if (!newHoliday.name || !newHoliday.date) {
      console.log('Missing holiday name or date');
      return;
    }

    try {
      console.log('Creating holiday:', newHoliday);
      
      // Use the new function that checks for impact on scheduled orders
      await createHolidayWithImpactCheck({
        name: newHoliday.name,
        date: new Date(newHoliday.date),
        isGlobal: newHoliday.isGlobal,
        affectedLineIds: newHoliday.isGlobal ? [] : newHoliday.affectedLineIds
      });

      // Reset form
      setNewHoliday({
        name: '',
        date: '',
        isGlobal: true,
        affectedLineIds: []
      });
      setSelectedLinesForHoliday([]);
      
      console.log('✅ Holiday created successfully');
      
    } catch (error) {
      console.error('❌ Failed to create holiday:', error);
    }
  };

  const handleLineSelectionForHoliday = (lineId: string) => {
    setSelectedLinesForHoliday(prev => {
      if (prev.includes(lineId)) {
        return prev.filter(id => id !== lineId);
      } else {
        return [...prev, lineId];
      }
    });
  };

  useEffect(() => {
    setNewHoliday(prev => ({ ...prev, affectedLineIds: selectedLinesForHoliday }));
  }, [selectedLinesForHoliday]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>

      {/* Production Line Management */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Production Lines</h2>
        <div className="flex space-x-4">
          <div>
            <Label htmlFor="lineName">Line Name</Label>
            <Input
              type="text"
              id="lineName"
              value={newProductionLine.name}
              onChange={(e) => setNewProductionLine({ ...newProductionLine, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="lineCapacity">Capacity</Label>
            <Input
              type="number"
              id="lineCapacity"
              value={newProductionLine.capacity.toString()}
              onChange={(e) =>
                setNewProductionLine({ ...newProductionLine, capacity: parseInt(e.target.value) })
              }
            />
          </div>
          <div>
            <Button onClick={handleCreateLine}>Create Line</Button>
          </div>
        </div>

        {/* Display existing production lines */}
        <div className="mt-4">
          <h3 className="text-lg font-medium mb-2">Existing Production Lines</h3>
          <div className="grid gap-2">
            {productionLines.map((line) => (
              <div key={line.id} className="flex items-center justify-between p-2 border rounded">
                <span>{line.name} (Capacity: {line.capacity})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Holiday Management */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Holidays</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="holidayName">Holiday Name</Label>
            <Input
              type="text"
              id="holidayName"
              value={newHoliday.name}
              onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Date</Label>
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={'outline'}
                  className={format(new Date(), 'PPP')}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {newHoliday.date ? format(new Date(newHoliday.date), 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" side="bottom">
                <Calendar
                  mode="single"
                  defaultMonth={new Date()}
                  selected={newHoliday.date ? new Date(newHoliday.date) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      setNewHoliday({ ...newHoliday, date: date.toISOString().split('T')[0] });
                    }
                    setIsDatePickerOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isGlobal"
              checked={newHoliday.isGlobal}
              onCheckedChange={(checked) => {
                const isChecked = checked === true;
                setNewHoliday({ ...newHoliday, isGlobal: isChecked, affectedLineIds: [] });
                setSelectedLinesForHoliday([]);
              }}
            />
            <Label htmlFor="isGlobal">Global Holiday</Label>
          </div>
          {!newHoliday.isGlobal && (
            <div>
              <Label>Affected Production Lines</Label>
              <div className="grid grid-cols-2 gap-2">
                {productionLines.map((line) => (
                  <div key={line.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`line-${line.id}`}
                      checked={selectedLinesForHoliday.includes(line.id)}
                      onCheckedChange={() => handleLineSelectionForHoliday(line.id)}
                    />
                    <Label htmlFor={`line-${line.id}`}>{line.name}</Label>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Button onClick={handleCreateHoliday}>Create Holiday</Button>
        </div>

        {/* Display existing holidays */}
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-2">Existing Holidays</h3>
          <div className="grid gap-2">
            {holidays.map((holiday) => (
              <div key={holiday.id} className="flex items-center justify-between p-2 border rounded">
                <div>
                  <span className="font-medium">{holiday.name}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    {format(holiday.date, 'PPP')}
                  </span>
                  {holiday.isGlobal ? (
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                      Global
                    </span>
                  ) : (
                    <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                      Lines: {holiday.affectedLineIds?.length || 0}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
