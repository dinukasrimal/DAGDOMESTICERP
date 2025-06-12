
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Calendar } from './ui/calendar';
import { ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { Plus, Trash2, Edit, Settings, Calendar as CalendarIcon, Target } from 'lucide-react';

interface AdminPanelProps {
  productionLines: ProductionLine[];
  holidays: Holiday[];
  rampUpPlans: RampUpPlan[];
  onProductionLinesChange: (lines: ProductionLine[]) => void;
  onHolidaysChange: (holidays: Holiday[]) => void;
  onRampUpPlansChange: (plans: RampUpPlan[]) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  productionLines,
  holidays,
  rampUpPlans,
  onProductionLinesChange,
  onHolidaysChange,
  onRampUpPlansChange
}) => {
  const [newLineName, setNewLineName] = useState('');
  const [newLineCapacity, setNewLineCapacity] = useState<number>(100);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanEfficiencies, setNewPlanEfficiencies] = useState<{ day: number; efficiency: number }[]>([
    { day: 1, efficiency: 50 }
  ]);
  const [finalEfficiency, setFinalEfficiency] = useState<number>(90);

  const handleAddProductionLine = () => {
    if (newLineName.trim()) {
      const newLine: ProductionLine = {
        id: Date.now().toString(),
        name: newLineName.trim(),
        capacity: newLineCapacity
      };
      onProductionLinesChange([...productionLines, newLine]);
      setNewLineName('');
      setNewLineCapacity(100);
    }
  };

  const handleDeleteProductionLine = (id: string) => {
    onProductionLinesChange(productionLines.filter(line => line.id !== id));
  };

  const handleAddHoliday = () => {
    if (selectedDate && newHolidayName.trim()) {
      const newHoliday: Holiday = {
        id: Date.now().toString(),
        date: selectedDate,
        name: newHolidayName.trim()
      };
      onHolidaysChange([...holidays, newHoliday]);
      setNewHolidayName('');
    }
  };

  const handleDeleteHoliday = (id: string) => {
    onHolidaysChange(holidays.filter(holiday => holiday.id !== id));
  };

  const handleAddRampUpPlan = () => {
    if (newPlanName.trim() && newPlanEfficiencies.length > 0) {
      const newPlan: RampUpPlan = {
        id: Date.now().toString(),
        name: newPlanName.trim(),
        efficiencies: [...newPlanEfficiencies],
        finalEfficiency
      };
      onRampUpPlansChange([...rampUpPlans, newPlan]);
      setNewPlanName('');
      setNewPlanEfficiencies([{ day: 1, efficiency: 50 }]);
      setFinalEfficiency(90);
    }
  };

  const handleDeleteRampUpPlan = (id: string) => {
    onRampUpPlansChange(rampUpPlans.filter(plan => plan.id !== id));
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
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Admin Panel</h2>
        <p className="text-muted-foreground">Manage production lines, holidays, and ramp-up plans</p>
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
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Capacity:</label>
                  <Input
                    type="number"
                    value={newLineCapacity}
                    onChange={(e) => setNewLineCapacity(parseInt(e.target.value) || 100)}
                    placeholder="100"
                  />
                </div>
              </div>
              <Button onClick={handleAddProductionLine} disabled={!newLineName.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Production Line
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
                    onSelect={setSelectedDate}
                    className="rounded-md border"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Holiday Name:</label>
                  <Input
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    placeholder="e.g., New Year's Day"
                  />
                  <Button 
                    onClick={handleAddHoliday} 
                    disabled={!selectedDate || !newHolidayName.trim()}
                    className="mt-4"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Holiday
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
                      <div className="text-sm text-muted-foreground">{holiday.date.toLocaleDateString()}</div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteHoliday(holiday.id)}
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
                      />
                      <span className="text-sm">%</span>
                      {newPlanEfficiencies.length > 1 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeEfficiencyDay(eff.day)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addEfficiencyDay}>
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
                  />
                  <span className="text-sm">%</span>
                </div>
              </div>
              
              <Button onClick={handleAddRampUpPlan} disabled={!newPlanName.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Create Ramp-Up Plan
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
