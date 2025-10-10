import { supabase } from '@/integrations/supabase/client';

export type AppComponentKey =
  | 'dashboard'
  | 'planner'
  | 'materials'
  | 'bom'
  | 'purchase-orders'
  | 'goods-received'
  | 'goods-issue'
  | 'cutting-records'
  | 'cut-issue-records'
  | 'sewing-output'
  | 'sewing-order-summary'
  | 'marker-requests'
  | 'reports'
  | 'bills'
  | 'accounting-chart'
  | 'accounting-journals'
  | 'user-management';

export interface AppComponent {
  key: AppComponentKey;
  label: string;
  category: 'navigation' | 'accounting' | 'administration';
  description?: string;
}

export const APP_COMPONENTS: AppComponent[] = [
  { key: 'dashboard', label: 'Dashboard', category: 'navigation' },
  { key: 'planner', label: 'Production Planner', category: 'navigation' },
  { key: 'materials', label: 'Raw Materials', category: 'navigation' },
  { key: 'bom', label: 'Bill of Materials', category: 'navigation' },
  { key: 'purchase-orders', label: 'Purchase Orders', category: 'navigation' },
  { key: 'goods-received', label: 'Goods Received', category: 'navigation' },
  { key: 'goods-issue', label: 'Goods Issue', category: 'navigation' },
  { key: 'cutting-records', label: 'Cutting Records', category: 'navigation' },
  { key: 'cut-issue-records', label: 'Cut Issue Records', category: 'navigation' },
  { key: 'sewing-output', label: 'Sewing Output', category: 'navigation' },
  { key: 'sewing-order-summary', label: 'Sewing Summary', category: 'navigation' },
  { key: 'marker-requests', label: 'Marker Requests', category: 'navigation' },
  { key: 'reports', label: 'Reports & Analytics', category: 'navigation' },
  { key: 'bills', label: 'Bills', category: 'accounting' },
  { key: 'accounting-chart', label: 'Chart of Accounts', category: 'accounting' },
  { key: 'accounting-journals', label: 'Manual Journals', category: 'accounting' },
  { key: 'user-management', label: 'User Management', category: 'administration' },
];

export interface RolePermission {
  componentKey: AppComponentKey;
  isEnabled: boolean;
}

export interface AppRole {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: RolePermission[];
}

export interface AppUserRecord {
  userId: string;
  email: string;
  fullName?: string | null;
  isActive: boolean;
  roles: AppRoleSummary[];
}

export interface AppRoleSummary {
  id: string;
  name: string;
}

export type OverrideState = 'inherit' | 'enabled' | 'disabled';

interface ComponentOverrideRow {
  component_key: AppComponentKey;
  is_enabled: boolean;
}

interface RoleRow {
  id: string;
  name: string;
  description?: string | null;
  is_system?: boolean;
  app_role_permissions?: Array<{ component_key: AppComponentKey; is_enabled: boolean }>;
}

interface UserRoleRow {
  user_id: string;
  role: { id: string; name: string } | null;
}

interface UserRoleWithPermissionsRow {
  role: {
    id: string;
    name: string;
    app_role_permissions: Array<{ component_key: AppComponentKey; is_enabled: boolean }> | null;
  } | null;
}

class UserManagementService {
  async listRoles(): Promise<AppRole[]> {
    const { data, error } = await supabase
      .from('app_roles')
      .select('id, name, description, is_system, app_role_permissions(component_key, is_enabled)')
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to load roles: ${error.message}`);
    }

    const rows = (data ?? []) as RoleRow[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isSystem: Boolean(row.is_system),
      permissions: (row.app_role_permissions ?? []).map((permission) => ({
        componentKey: permission.component_key,
        isEnabled: permission.is_enabled,
      })),
    }));
  }

  async createRole(payload: { name: string; description?: string }): Promise<string> {
    const { data, error } = await supabase
      .from('app_roles')
      .insert({
        name: payload.name.trim(),
        description: payload.description?.trim() ?? null,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create role: ${error?.message ?? 'Unknown error'}`);
    }

    return data.id as string;
  }

  async updateRole(roleId: string, updates: { name?: string; description?: string }): Promise<void> {
    const { error } = await supabase
      .from('app_roles')
      .update({
        name: updates.name?.trim(),
        description: updates.description?.trim() ?? null,
      })
      .eq('id', roleId);

    if (error) {
      throw new Error(`Failed to update role: ${error.message}`);
    }
  }

  async deleteRole(roleId: string): Promise<void> {
    const { error } = await supabase
      .from('app_roles')
      .delete()
      .eq('id', roleId);

    if (error) {
      throw new Error(`Failed to delete role: ${error.message}`);
    }
  }

  async setRolePermission(params: { roleId: string; componentKey: AppComponentKey; isEnabled: boolean }): Promise<void> {
    const { error } = await supabase
      .from('app_role_permissions')
      .upsert({
        role_id: params.roleId,
        component_key: params.componentKey,
        is_enabled: params.isEnabled,
      });

    if (error) {
      throw new Error(`Failed to update permission: ${error.message}`);
    }
  }

  async listUsers(): Promise<AppUserRecord[]> {
    const { data, error } = await supabase.rpc('app_list_users');
    if (error) {
      throw new Error(error.message ?? 'Unable to load users');
    }

    const directory = (data ?? []) as Array<{ user_id: string; email: string; full_name?: string | null; is_active?: boolean | null }>;

    if (!directory.length) {
      return [];
    }

    const userIds = directory.map((entry) => entry.user_id);

    const { data: roleRows, error: rolesError } = await supabase
      .from('app_user_roles')
      .select('user_id, role:app_roles(id, name)')
      .in('user_id', userIds);

    if (rolesError) {
      throw new Error(`Failed to load user roles: ${rolesError.message}`);
    }

    const roleMap = new Map<string, AppRoleSummary[]>();
    (roleRows ?? []).forEach((row: UserRoleRow) => {
      const list = roleMap.get(row.user_id) ?? [];
      if (row.role) {
        list.push({ id: row.role.id, name: row.role.name });
      }
      roleMap.set(row.user_id, list);
    });

    return directory.map((entry) => ({
      userId: entry.user_id,
      email: entry.email,
      fullName: entry.full_name ?? null,
      isActive: entry.is_active ?? true,
      roles: roleMap.get(entry.user_id) ?? [],
    }));
  }

  async createUser(payload: { email: string; password: string; fullName?: string; roleIds?: string[] }): Promise<void> {
    const response = await supabase.functions.invoke('user-admin', {
      body: payload,
    });

    if (response.error) {
      throw new Error(response.error.message ?? 'Failed to create user');
    }
  }

  async updateUserAccess(payload: { userId: string; roleIds?: string[]; isActive?: boolean }): Promise<void> {
    const response = await supabase.functions.invoke('user-admin', {
      method: 'PATCH',
      body: payload,
    });

    if (response.error) {
      throw new Error(response.error.message ?? 'Failed to update user');
    }
  }

  async listOverrides(userId: string): Promise<Record<AppComponentKey, OverrideState>> {
    const { data, error } = await supabase
      .from('app_component_overrides')
      .select('component_key, is_enabled')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to load overrides: ${error.message}`);
    }

    const overrides: Record<AppComponentKey, OverrideState> = {} as Record<AppComponentKey, OverrideState>;
    (data ?? []).forEach((row: ComponentOverrideRow) => {
      overrides[row.component_key] = row.is_enabled ? 'enabled' : 'disabled';
    });
    return overrides;
  }

  async setOverride(userId: string, componentKey: AppComponentKey, state: OverrideState): Promise<void> {
    if (state === 'inherit') {
      const { error } = await supabase
        .from('app_component_overrides')
        .delete()
        .match({ user_id: userId, component_key: componentKey });
      if (error) {
        throw new Error(`Failed to remove override: ${error.message}`);
      }
      return;
    }

    const { error } = await supabase
      .from('app_component_overrides')
      .upsert({
        user_id: userId,
        component_key: componentKey,
        is_enabled: state === 'enabled',
      });

    if (error) {
      throw new Error(`Failed to update override: ${error.message}`);
    }
  }

  async getComponentAccess(userId: string): Promise<{
    allowed: Set<AppComponentKey>;
    blocked: Set<AppComponentKey>;
    roles: AppRoleSummary[];
    roleEffectiveMap: Record<AppComponentKey, boolean>;
    overrides: Record<AppComponentKey, OverrideState>;
    isOwner: boolean;
    isActive: boolean;
  }> {
    const [{ data: rolesData, error: rolesError }, { data: overridesData, error: overridesError }, { data: userRow, error: userError }] = await Promise.all([
      supabase
        .from('app_user_roles')
        .select('role:app_roles(id, name, app_role_permissions(component_key, is_enabled))')
        .eq('user_id', userId),
      supabase
        .from('app_component_overrides')
        .select('component_key, is_enabled')
        .eq('user_id', userId),
      supabase
        .from('app_users')
        .select('is_active')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (rolesError) {
      throw new Error(`Failed to load roles: ${rolesError.message}`);
    }
    if (overridesError) {
      throw new Error(`Failed to load overrides: ${overridesError.message}`);
    }
    if (userError && userError.code !== 'PGRST116') {
      throw new Error(`Failed to load user profile: ${userError.message}`);
    }

    const allowed = new Set<AppComponentKey>();
    const blocked = new Set<AppComponentKey>();
    const roleNames: AppRoleSummary[] = [];
    const roleEffective: Record<AppComponentKey, boolean> = {} as Record<AppComponentKey, boolean>;

    (rolesData ?? []).forEach((row: UserRoleWithPermissionsRow) => {
      if (!row.role) return;
      roleNames.push({ id: row.role.id, name: row.role.name });
      const permissions = row.role.app_role_permissions ?? [];
      permissions.forEach((permission) => {
        roleEffective[permission.component_key] = Boolean(permission.is_enabled);
        if (permission.is_enabled) {
          allowed.add(permission.component_key);
        } else {
          blocked.add(permission.component_key);
        }
      });
    });

    const isOwner = roleNames.some((role) => role.name === 'owner');

    if (isOwner) {
      APP_COMPONENTS.forEach((component) => {
        allowed.add(component.key);
        roleEffective[component.key] = true;
      });
      blocked.clear();
    }

    const overrides: Record<AppComponentKey, OverrideState> = {} as Record<AppComponentKey, OverrideState>;
    (overridesData ?? []).forEach((row: ComponentOverrideRow) => {
      overrides[row.component_key] = row.is_enabled ? 'enabled' : 'disabled';
      if (row.is_enabled) {
        allowed.add(row.component_key);
        blocked.delete(row.component_key);
      } else {
        blocked.add(row.component_key);
        allowed.delete(row.component_key);
      }
    });
    const isActive = userRow ? userRow.is_active !== false : true;

    if (!isOwner) {
      blocked.forEach((component) => {
        if (blocked.has(component)) {
          allowed.delete(component);
        }
      });
    }

    return {
      allowed,
      blocked,
      roles: roleNames,
      roleEffectiveMap: roleEffective,
      overrides,
      isOwner,
      isActive,
    };
  }
}

export const userManagementService = new UserManagementService();
