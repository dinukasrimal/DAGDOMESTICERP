
import React from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Settings, Calendar, Users } from 'lucide-react';

interface HeaderProps {
  userRole: 'planner' | 'superuser';
  onToggleAdmin: () => void;
  onRoleChange: (role: 'planner' | 'superuser') => void;
}

export const Header: React.FC<HeaderProps> = ({
  userRole,
  onToggleAdmin,
  onRoleChange
}) => {
  return (
    <header className="border-b border-border bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-foreground">
            Dynamic Visual Production Scheduler
          </h1>
          <Badge variant={userRole === 'superuser' ? 'default' : 'secondary'}>
            {userRole === 'superuser' ? 'Super User' : 'Planner'}
          </Badge>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">Role:</label>
            <select 
              value={userRole}
              onChange={(e) => onRoleChange(e.target.value as 'planner' | 'superuser')}
              className="px-3 py-1 border border-border rounded-md bg-background"
            >
              <option value="planner">Planner</option>
              <option value="superuser">Super User</option>
            </select>
          </div>
          
          {userRole === 'superuser' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleAdmin}
              className="flex items-center space-x-2"
            >
              <Settings className="h-4 w-4" />
              <span>Admin Panel</span>
            </Button>
          )}
          
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
