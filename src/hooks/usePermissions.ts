import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { userManagementService, type AppComponentKey } from '@/services/userManagementService';

interface PermissionSnapshot {
  allowed: Set<AppComponentKey>;
  blocked: Set<AppComponentKey>;
  roles: { id: string; name: string }[];
  isOwner: boolean;
  isActive: boolean;
}

const emptySnapshot: PermissionSnapshot = {
  allowed: new Set(),
  blocked: new Set(),
  roles: [],
  isOwner: false,
  isActive: true,
};

export const usePermissions = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['component-permissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return emptySnapshot;
      const access = await userManagementService.getComponentAccess(user.id);
      return {
        allowed: access.allowed,
        blocked: access.blocked,
        roles: access.roles,
        isOwner: access.isOwner,
        isActive: access.isActive,
      } satisfies PermissionSnapshot;
    },
    enabled: Boolean(user?.id),
    staleTime: 1000 * 30,
  });

  const snapshot = query.data ?? emptySnapshot;

  const hasAccess = (componentKey: AppComponentKey) => snapshot.allowed.has(componentKey);

  return {
    ...snapshot,
    hasAccess,
    refresh: query.refetch,
    loading: query.isLoading,
  };
};
