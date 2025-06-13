import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Calendar } from './ui/calendar';
import { Checkbox } from './ui/checkbox';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { Plus, Trash2, Edit, Settings, Calendar as CalendarIcon, Target, ArrowLeft } from 'lucide-react';
import { supabaseDataService } from '../services/supabaseDataService';
import { toast } from './ui/use-toast';

interface AdminPanelProps {
  orders: Order[];
  productionLines: ProductionLine[];
  holidays: Holiday[];
  rampUpPlans: RampUpPlan[];
  onOrdersChange: (orders: Order[]) => void;
  onProductionLinesChange: (lines: ProductionLine[]) => void;
  onHolidaysChange: (holidays: Holiday[]) => void;
  onRampUpPlansChange: (plans: RampUpPlan[]) => void;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  orders,
  productionLines,
  holidays,
  rampUpPlans,
  onOrdersChange,
  onProductionLinesChange,
  onHolidaysChange,
  onRampUpPlansChange,
  onClose
}) => {
  const [newLineName, setNewLineName] = useState('');
  const [newLineCapacity, setNewLineCapacity] = useState<number>(100);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [newHolidayName, setNewHolidayName] = useState('');
  const [isGlobalHoliday, setIsGlobalHoliday] = useState(true);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanEfficiencies, setNewPlanEfficiencies] = useState<{ day: number; efficiency: number }[]>([
    { day: 1, efficiency: 50 }
  ]);
  const [finalEfficiency, setFinalEfficiency] = useState<number>(90);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddProductionLine = async () => {
    if (newLineName.trim()) {
      setIsLoading(true);
      try {
        const newLine = await supabaseDataService.createProductionLine({
          name: newLineName.trim(),
          capacity: newLineCapacity
        });
        onProductionLinesChange([...productionLines, newLine]);
        setNewLineName('');
        setNewLineCapacity(100);
        toast({
          title: "Success",
          description: "Production line created successfully"
        });
      } catch (error) {
        console.error('Error creating production line:', error);
        toast({
          title: "Error",
          description: "Failed to create production line",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDeleteProductionLine = async (id: string) => {
    setIsLoading(true);
    try {
      await supabaseDataService.deleteProductionLine(id);
      onProductionLinesChange(productionLines.filter(line => line.id !== id));
      toast({
        title: "Success",
        description: "Production line deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting production line:', error);
      toast({
        title: "Error",
        description: "Failed to delete production line",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddHoliday = async () => {
    if (selectedDate && newHolidayName.trim()) {
      // Validate line-specific holiday has lines selected
      if (!isGlobalHoliday && selectedLineIds.length === 0) {
        toast({
          title: "Error",
          description: "Please select at least one production line for line-specific holidays",
          variant: "destructive"
        });
        return;
      }

      setIsLoading(true);
      try {
        console.log('Selected date for holiday:', selectedDate);
        console.log('Holiday date string:', selectedDate.toDateString());
        
        const newHoliday = await supabaseDataService.createHoliday({
          date: selectedDate,
          name: newHolidayName.trim(),
          isGlobal: isGlobalHoliday,
          affectedLineIds: isGlobalHoliday ? [] : selectedLineIds
        });
        onHolidaysChange([...holidays, newHoliday]);
        setNewHolidayName('');
        setIsGlobalHoliday(true);
        setSelectedLineIds([]);
        toast({
          title: "Success",
          description: `Holiday "${newHolidayName.trim()}" created for ${selectedDate.toDateString()}`
        });
      } catch (error) {
        console.error('Error creating holiday:', error);
        toast({
          title: "Error",
          description: "Failed to create holiday",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    setIsLoading(true);
    try {
      await supabaseDataService.deleteHoliday(id);
      onHolidaysChange(holidays.filter(holiday => holiday.id !== id));
      toast({
        title: "Success",
        description: "Holiday deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting holiday:', error);
      toast({
        title: "Error",
        description: "Failed to delete holiday",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLineSelection = (lineId: string, checked: boolean) => {
    if (checked) {
      setSelectedLineIds([...selectedLineIds, lineId]);
    } else {
      setSelectedLineIds(selectedLineIds.filter(id => id !== lineId));
    }
  };

  const handleAddRampUpPlan = async () => {
    if (newPlanName.trim() && newPlanEfficiencies.length > 0) {
      setIsLoading(true);
      try {
        const newPlan = await supabaseDataService.createRampUpPlan({
          name: newPlanName.trim(),
          efficiencies: [...newPlanEfficiencies],
          finalEfficiency
        });
        onRampUpPlansChange([...rampUpPlans, newPlan]);
        setNewPlanName('');
        setNewPlanEfficiencies([{ day: 1, efficiency: 50 }]);
        setFinalEfficiency(90);
        toast({
          title: "Success",
          description: "Ramp-up plan created successfully"
        });
      } catch (error) {
        console.error('Error creating ramp-up plan:', error);
        toast({
          title: "Error",
          description: "Failed to create ramp-up plan",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDeleteRampUpPlan = async (id: string) => {
    setIsLoading(true);
    try {
      await supabaseDataService.deleteRampUpPlan(id);
      onRampUpPlansChange(rampUpPlans.filter(plan => plan.id !== id));
      toast({
        title: "Success",
        description: "Ramp-up plan deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting ramp-up plan:', error);
      toast({
        title: "Error",
        description: "Failed to delete ramp-up plan",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addEfficiencyDay = () => {
    const nextDay = Math.max(...newPlanEfficiencies.map(e => e.day)) + 1;
    setNewPlanEfficiencies([...newPlanEfficiencies, { day: nextDay, efficiency: 70 }]);
  };

  const updateEfficiency = (day: number, efficiency: number) => {
    setNewPlanEfficiencies(prev => 
      prev.map(e => e.day === day ? { ...e, efficiency } : e)
    );
  };

  const removeEfficiencyDay = (day: number) => {
    setNewPlanEfficiencies(prev => prev.filter(e => e.day !== day));
  };

  return (
    <div className="flex-1 p-6 bg-background overflow-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Admin Panel</h2>
          <p className="text-muted-foreground">Manage production lines, holidays, and ramp-up plans</p>
        </div>
        <Button onClick={onClose} variant="outline" className="flex items-center space-x-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Scheduler</span>
        </Button>
      </div>

      <Tabs defaultValue="lines" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lines" className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Production Lines</span>
          </TabsTrigger>
          <TabsTrigger value="holidays" className="flex items-center space-x-2">
            <CalendarIcon className="h-4 w-4" />
            <span>Holidays</span>
          </TabsTrigger>
          <TabsTrigger value="rampup" className="flex items-center space-x-2">
            <Target className="h-4 w-4" />
            <span>Ramp-Up Plans</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lines" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add Production Line</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Line Name:</label>
                  <Input
                    value={newLineName}
                    onChange={(e) => setNewLineName(e.target.value)}
                    placeholder="e.g., Line A - Knitwear"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Capacity:</label>
                  <Input
                    type="number"
                    value={newLineCapacity}
                    onChange={(e) => setNewLineCapacity(parseInt(e.target.value) || 100)}
                    placeholder="100"
                    disabled={isLoading}
                  />
                </div>
              </div>
              <Button 
                onClick={handleAddProductionLine} 
                disabled={!newLineName.trim() || isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                {isLoading ? 'Adding...' : 'Add Production Line'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Existing Production Lines</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {productionLines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{line.name}</div>
                      <div className="text-sm text-muted-foreground">Capacity: {line.capacity}</div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteProductionLine(line.id)}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add Holiday</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Select Date:</label>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      console.log('Calendar returned date:', date);
                      setSelectedDate(date);
                    }}
                    className="rounded-md border"
                    disabled={isLoading}
                  />
                  {selectedDate && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <p>Selected: {selectedDate.toDateString()}</p>
                      <p>Day: {selectedDate.getDate()}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Holiday Name:</label>
                    <Input
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      placeholder="e.g., New Year's Day"
                      disabled={isLoading}
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="global-holiday"
                      checked={isGlobalHoliday}
                      onCheckedChange={(checked) => {
                        setIsGlobalHoliday(checked as boolean);
                        if (checked) {
                          setSelectedLineIds([]);
                        }
                      }}
                      disabled={isLoading}
                    />
                    <label htmlFor="global-holiday" className="text-sm font-medium">
                      Global Holiday (affects all lines)
                    </label>
                  </div>

                  {!isGlobalHoliday && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Select Production Lines:
                      </label>
                      <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2">
                        {productionLines.map((line) => (
                          <div key={line.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`line-${line.id}`}
                              checked={selectedLineIds.includes(line.id)}
                              onCheckedChange={(checked) => handleLineSelection(line.id, checked as boolean)}
                              disabled={isLoading}
                            />
                            <label htmlFor={`line-${line.id}`} className="text-sm">
                              {line.name}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <Button 
                    onClick={handleAddHoliday} 
                    disabled={!selectedDate || !newHolidayName.trim() || isLoading}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {isLoading ? 'Adding...' : 'Add Holiday'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Existing Holidays</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {holidays.map((holiday) => (
                  <div key={holiday.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{holiday.name}</div>
                      <div className="text-sm text-muted-foreground">{holiday.date.toDateString()}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={holiday.isGlobal ? "default" : "secondary"}>
                          {holiday.isGlobal ? "Global" : "Line-specific"}
                        </Badge>
                        {!holiday.isGlobal && holiday.affectedLineIds && holiday.affectedLineIds.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {holiday.affectedLineIds.map(lineId => {
                              const line = productionLines.find(l => l.id === lineId);
                              return line ? (
                                <Badge key={lineId} variant="outline" className="text-xs">
                                  {line.name}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteHoliday(holiday.id)}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rampup" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create Ramp-Up Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Plan Name:</label>
                <Input
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder="e.g., Fast Track Plan"
                  disabled={isLoading}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Daily Efficiencies:</label>
                <div className="space-y-2 mt-2">
                  {newPlanEfficiencies.map((eff) => (
                    <div key={eff.day} className="flex items-center space-x-2">
                      <span className="text-sm w-16">Day {eff.day}:</span>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={eff.efficiency}
                        onChange={(e) => updateEfficiency(eff.day, parseInt(e.target.value) || 0)}
                        className="w-20"
                        disabled={isLoading}
                      />
                      <span className="text-sm">%</span>
                      {newPlanEfficiencies.length > 1 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeEfficiencyDay(eff.day)}
                          disabled={isLoading}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={addEfficiencyDay}
                    disabled={isLoading}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Day
                  </Button>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Final Efficiency (Day {Math.max(...newPlanEfficiencies.map(e => e.day)) + 1} onwards):</label>
                <div className="flex items-center space-x-2 mt-1">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={finalEfficiency}
                    onChange={(e) => setFinalEfficiency(parseInt(e.target.value) || 90)}
                    className="w-20"
                    disabled={isLoading}
                  />
                  <span className="text-sm">%</span>
                </div>
              </div>
              
              <Button 
                onClick={handleAddRampUpPlan} 
                disabled={!newPlanName.trim() || isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                {isLoading ? 'Creating...' : 'Create Ramp-Up Plan'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Existing Ramp-Up Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {rampUpPlans.map((plan) => (
                  <div key={plan.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{plan.name}</div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteRampUpPlan(plan.id)}
                        disabled={isLoading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {plan.efficiencies.map((eff) => (
                        <Badge key={eff.day} variant="outline">
                          Day {eff.day}: {eff.efficiency}%
                        </Badge>
                      ))}
                      <Badge variant="default">
                        Final: {plan.finalEfficiency}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
