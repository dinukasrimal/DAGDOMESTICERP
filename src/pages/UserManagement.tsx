import React, { useMemo, useState } from 'react';
import { Users, ShieldCheck, Plus, KeyRound, RefreshCcw, Layers } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  APP_COMPONENTS,
  userManagementService,
  type AppComponentKey,
  type AppRole,
  type AppUserRecord,
  type OverrideState,
} from '@/services/userManagementService';

const UserManagement: React.FC = () => {
  const { toast } = useToast();
  const { refresh: refreshPermissions } = usePermissions();

  const rolesQuery = useQuery({
    queryKey: ['app-roles'],
    queryFn: () => userManagementService.listRoles(),
  });

  const usersQuery = useQuery({
    queryKey: ['app-users'],
    queryFn: () => userManagementService.listUsers(),
  });

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [manageUserId, setManageUserId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const createUserMutation = useMutation({
    mutationFn: userManagementService.createUser,
    onSuccess: () => {
      toast({ title: 'User created' });
      setCreateDialogOpen(false);
      void Promise.all([usersQuery.refetch(), refreshPermissions()]);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create user', description: error.message, variant: 'destructive' });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: userManagementService.updateUserAccess,
    onSuccess: () => {
      toast({ title: 'User updated' });
      void Promise.all([usersQuery.refetch(), refreshPermissions()]);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update user', description: error.message, variant: 'destructive' });
    },
  });

  const setOverrideMutation = useMutation({
    mutationFn: ({ userId, componentKey, state }: { userId: string; componentKey: AppComponentKey; state: OverrideState }) =>
      userManagementService.setOverride(userId, componentKey, state),
    onSuccess: () => {
      toast({ title: 'Override updated' });
      void refreshPermissions();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update override', description: error.message, variant: 'destructive' });
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: userManagementService.createRole,
    onSuccess: () => {
      toast({ title: 'Role created' });
      void rolesQuery.refetch();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create role', description: error.message, variant: 'destructive' });
    },
  });

  const setRolePermissionMutation = useMutation({
    mutationFn: userManagementService.setRolePermission,
    onSuccess: () => {
      toast({ title: 'Permission saved' });
      void Promise.all([rolesQuery.refetch(), refreshPermissions()]);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update permission', description: error.message, variant: 'destructive' });
    },
  });

  const [createUserForm, setCreateUserForm] = useState({
    email: '',
    password: '',
    fullName: '',
    roleIds: [] as string[],
  });

  const [newRoleForm, setNewRoleForm] = useState({
    name: '',
    description: '',
  });

  const activeRole = useMemo(() => {
    const list = rolesQuery.data ?? [];
    if (!list.length) return null;
    if (selectedRoleId) {
      return list.find((role) => role.id === selectedRoleId) ?? list[0];
    }
    return list[0];
  }, [rolesQuery.data, selectedRoleId]);

  const currentUserRecord: AppUserRecord | undefined = useMemo(() => {
    if (!manageUserId) return undefined;
    return usersQuery.data?.find((entry) => entry.userId === manageUserId);
  }, [manageUserId, usersQuery.data]);

  const [userOverrides, setUserOverrides] = useState<Record<AppComponentKey, OverrideState>>({} as Record<AppComponentKey, OverrideState>);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userActive, setUserActive] = useState<boolean>(true);

  const openManageUser = async (user: AppUserRecord) => {
    setManageUserId(user.userId);
    setUserRoles(user.roles.map((role) => role.id));
    setUserActive(user.isActive);
    try {
      const overrides = await userManagementService.listOverrides(user.userId);
      setUserOverrides(overrides);
    } catch (error) {
      console.error(error);
      toast({ title: 'Failed to load overrides', variant: 'destructive' });
    }
  };

  const closeManageUser = () => {
    setManageUserId(null);
    setUserOverrides({} as Record<AppComponentKey, OverrideState>);
  };

  const handleCreateUser = () => {
    if (!createUserForm.email || !createUserForm.password) {
      toast({ title: 'Email and password required', variant: 'destructive' });
      return;
    }
    createUserMutation.mutate({
      email: createUserForm.email,
      password: createUserForm.password,
      fullName: createUserForm.fullName,
      roleIds: createUserForm.roleIds,
    });
  };

  const toggleRoleSelection = (roleId: string) => {
    setCreateUserForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

  const toggleManageRole = (roleId: string) => {
    setUserRoles((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  };

  const handleSaveUserRoles = () => {
    if (!manageUserId) return;
    updateUserMutation.mutate({ userId: manageUserId, roleIds: userRoles });
  };

  const handleSaveUserActive = (value: boolean) => {
    if (!manageUserId) return;
    setUserActive(value);
    updateUserMutation.mutate({ userId: manageUserId, isActive: value });
  };

  return (
    <ModernLayout
      title="User Management"
      description="Invite teammates, assign roles, and control feature access."
      icon={Users}
      gradient="bg-gradient-to-r from-amber-500 to-rose-500"
    >
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Role Permissions</CardTitle>
                <CardDescription>Enable or disable application areas per role.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="gap-2" onClick={() => rolesQuery.refetch()}>
                <RefreshCcw className="h-4 w-4" /> Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-64 space-y-3">
                <Tabs value={activeRole?.id ?? ''} onValueChange={setSelectedRoleId} orientation="vertical" className="w-full">
                  <TabsList className="flex md:flex-col w-full">
                    {(rolesQuery.data ?? []).map((role) => (
                      <TabsTrigger key={role.id} value={role.id} className="justify-start">
                        <span className="truncate">{role.name}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <div className="space-y-2">
                  <Input
                    placeholder="Role name"
                    value={newRoleForm.name}
                    onChange={(e) => setNewRoleForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Description (optional)"
                    value={newRoleForm.description}
                    onChange={(e) => setNewRoleForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      if (!newRoleForm.name.trim()) {
                        toast({ title: 'Role name required', variant: 'destructive' });
                        return;
                      }
                      createRoleMutation.mutate({ name: newRoleForm.name, description: newRoleForm.description });
                      setNewRoleForm({ name: '', description: '' });
                    }}
                    disabled={createRoleMutation.isLoading}
                  >
                    <Plus className="h-4 w-4" /> Add role
                  </Button>
                </div>
              </div>
              <div className="flex-1">
                {activeRole ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">{activeRole.name}</h3>
                        <p className="text-sm text-muted-foreground">{activeRole.description ?? 'No description provided.'}</p>
                      </div>
                    </div>
                    <div className="border rounded-xl">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Component</TableHead>
                            <TableHead className="text-right">Enabled</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {APP_COMPONENTS.map((component) => {
                            const permission = activeRole.permissions.find((p) => p.componentKey === component.key);
                            const enabled = permission ? permission.isEnabled : false;
                            return (
                              <TableRow key={component.key}>
                                <TableCell>
                                  <div className="font-medium">{component.label}</div>
                                  <div className="text-xs text-muted-foreground uppercase tracking-wide">{component.category}</div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Switch
                                    checked={enabled}
                                    onCheckedChange={(value) =>
                                      setRolePermissionMutation.mutate({
                                        roleId: activeRole.id,
                                        componentKey: component.key,
                                        isEnabled: value,
                                      })
                                    }
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Create a role to begin configuring permissions.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Workspace Users</CardTitle>
              <CardDescription>Invite teammates and control their access.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="gap-2" onClick={() => usersQuery.refetch()}>
                <RefreshCcw className="h-4 w-4" /> Refresh
              </Button>
              <Button size="sm" className="gap-2" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4" /> New user
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[360px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(usersQuery.data ?? []).map((user) => (
                    <TableRow key={user.userId}>
                      <TableCell>
                        <div className="font-medium">{user.email}</div>
                        <div className="text-xs text-muted-foreground">{user.fullName ?? '—'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? 'default' : 'outline'}>{user.isActive ? 'Active' : 'Disabled'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <Badge key={role.id} variant="secondary">{role.name}</Badge>
                          ))}
                          {user.roles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openManageUser(user)}>
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a user</DialogTitle>
            <DialogDescription>Invite a teammate by email, set a password, and assign initial roles.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Email"
              value={createUserForm.email}
              onChange={(e) => setCreateUserForm((prev) => ({ ...prev, email: e.target.value }))}
              type="email"
            />
            <Input
              placeholder="Temporary password"
              value={createUserForm.password}
              onChange={(e) => setCreateUserForm((prev) => ({ ...prev, password: e.target.value }))}
              type="password"
            />
            <Input
              placeholder="Full name (optional)"
              value={createUserForm.fullName}
              onChange={(e) => setCreateUserForm((prev) => ({ ...prev, fullName: e.target.value }))}
            />
            <div>
              <div className="text-sm font-medium mb-2">Assign roles</div>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {(rolesQuery.data ?? []).map((role) => (
                  <label key={role.id} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border"
                      checked={createUserForm.roleIds.includes(role.id)}
                      onChange={() => toggleRoleSelection(role.id)}
                    />
                    <span>{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={createUserMutation.isLoading}>
              {createUserMutation.isLoading ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(manageUserId)} onOpenChange={(open) => (!open ? closeManageUser() : undefined)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Manage user
            </DialogTitle>
            <DialogDescription>Adjust roles, status, and component overrides.</DialogDescription>
          </DialogHeader>
          {manageUserId && currentUserRecord ? (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="md:w-72 space-y-4">
                  <div>
                    <div className="text-sm font-semibold">Status</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm">Active</span>
                      <Switch
                        checked={userActive}
                        onCheckedChange={(value) => handleSaveUserActive(value)}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-2">Roles</div>
                    <div className="border rounded-lg p-3 space-y-2 max-h-56 overflow-y-auto">
                      {(rolesQuery.data ?? []).map((role) => (
                        <label key={role.id} className="flex items-center justify-between text-sm">
                          <span>{role.name}</span>
                          <Switch
                            checked={userRoles.includes(role.id)}
                            onCheckedChange={() => toggleManageRole(role.id)}
                          />
                        </label>
                      ))}
                    </div>
                    <Button size="sm" className="mt-3" onClick={handleSaveUserRoles} disabled={updateUserMutation.isLoading}>
                      Save roles
                    </Button>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">Component overrides</h3>
                      <p className="text-sm text-muted-foreground">Set exceptions for this user beyond role defaults.</p>
                    </div>
                  </div>
                  <div className="border rounded-xl">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Component</TableHead>
                          <TableHead className="text-center">Effective</TableHead>
                          <TableHead className="text-center">Override</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {APP_COMPONENTS.map((component) => {
                          const currentState = userOverrides[component.key] ?? 'inherit';
                          return (
                            <TableRow key={component.key}>
                              <TableCell>
                                <div className="font-medium flex items-center gap-2">
                                  <Layers className="h-4 w-4 text-muted-foreground" />
                                  {component.label}
                                </div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">{component.category}</div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={currentState === 'disabled' ? 'outline' : 'default'}>
                                  {currentState === 'inherit' ? 'Role default' : currentState === 'enabled' ? 'Enabled' : 'Disabled'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="inline-flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant={currentState === 'inherit' ? 'default' : 'outline'}
                                    onClick={() => {
                                      setUserOverrides((prev) => ({ ...prev, [component.key]: 'inherit' }));
                                      setOverrideMutation.mutate({ userId: manageUserId, componentKey: component.key, state: 'inherit' });
                                    }}
                                  >
                                    Inherit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={currentState === 'enabled' ? 'default' : 'outline'}
                                    onClick={() => {
                                      setUserOverrides((prev) => ({ ...prev, [component.key]: 'enabled' }));
                                      setOverrideMutation.mutate({ userId: manageUserId, componentKey: component.key, state: 'enabled' });
                                    }}
                                  >
                                    Enable
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={currentState === 'disabled' ? 'default' : 'outline'}
                                    onClick={() => {
                                      setUserOverrides((prev) => ({ ...prev, [component.key]: 'disabled' }));
                                      setOverrideMutation.mutate({ userId: manageUserId, componentKey: component.key, state: 'disabled' });
                                    }}
                                  >
                                    Disable
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-muted-foreground">Select a user to manage their access.</div>
          )}
        </DialogContent>
      </Dialog>
    </ModernLayout>
  );
};

export default UserManagement;
