
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import type { AppComponentKey } from '@/services/userManagementService';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  componentKey?: AppComponentKey;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, componentKey }) => {
  const { user, loading } = useAuth();
  const { loading: permissionsLoading, isActive, hasAccess } = usePermissions();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Checking access…</p>
        </div>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">Account Disabled</h1>
          <p className="text-muted-foreground text-sm">
            Your account has been disabled by an administrator. Please contact your workspace owner to regain access.
          </p>
        </div>
      </div>
    );
  }

  if (componentKey && !hasAccess(componentKey)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">Access Restricted</h1>
          <p className="text-muted-foreground text-sm">
            You do not have permission to view this area. If you believe this is a mistake, please reach out to your administrator.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
