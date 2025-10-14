import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Package,
  FileText,
  Settings,
  Home,
  Users,
  Factory,
  ShoppingCart,
  Sparkles,
  ArrowLeft,
  ClipboardList,
  Truck,
  Minus,
  Ruler,
  Scissors,
  ScissorsSquare,
  Shirt,
  FileSpreadsheet,
  Receipt,
  NotebookPen,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import type { AppComponentKey } from '@/services/userManagementService';

interface ModernLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
}

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path?: string;
  available: boolean;
  isSpecial?: boolean;
  view?: string;
  children?: SidebarItem[];
  componentKey?: AppComponentKey;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/', available: true, isSpecial: true, view: 'dashboard', componentKey: 'dashboard' },
  { id: 'planner', label: 'Production Planner', icon: ClipboardList, path: '/', available: true, isSpecial: true, view: 'planner', componentKey: 'planner' },
  { id: 'materials', label: 'Raw Materials', icon: Package, path: '/materials', available: true, isSpecial: false, componentKey: 'materials' },
  { id: 'bom', label: 'Bill of Materials', icon: Factory, path: '/bom', available: true, isSpecial: false, componentKey: 'bom' },
  { id: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, path: '/purchase-orders', available: true, isSpecial: false, componentKey: 'purchase-orders' },
  { id: 'goods-received', label: 'Goods Received', icon: Truck, path: '/goods-received', available: true, isSpecial: false, componentKey: 'goods-received' },
  { id: 'goods-issue', label: 'Goods Issue', icon: Minus, path: '/goods-issue', available: true, isSpecial: false, componentKey: 'goods-issue' },
  { id: 'cutting-records', label: 'Cutting Records', icon: Scissors, path: '/cutting-records', available: true, isSpecial: false, componentKey: 'cutting-records' },
  { id: 'cut-issue-records', label: 'Cut Issue Records', icon: ScissorsSquare, path: '/cut-issue-records', available: true, isSpecial: false, componentKey: 'cut-issue-records' },
  { id: 'sewing-output', label: 'Sewing Output', icon: Shirt, path: '/sewing-output', available: true, isSpecial: false, componentKey: 'sewing-output' },
  { id: 'sewing-order-summary', label: 'Sewing Order Summary', icon: FileSpreadsheet, path: '/sewing-order-summary', available: true, isSpecial: false, componentKey: 'sewing-order-summary' },
  { id: 'bills', label: 'Bills', icon: Receipt, path: '/bills', available: true, isSpecial: false, componentKey: 'bills' },
  {
    id: 'accounting',
    label: 'Accounting',
    icon: BookOpen,
    available: true,
    isSpecial: false,
    children: [
      { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: BookOpen, path: '/accounting/chart-of-accounts', available: true, componentKey: 'accounting-chart' },
      { id: 'manual-journals', label: 'Manual Journals', icon: NotebookPen, path: '/accounting/manual-journals', available: true, componentKey: 'accounting-journals' },
    ],
  },
  { id: 'user-management', label: 'User Management', icon: Users, path: '/admin/users', available: true, isSpecial: false, componentKey: 'user-management' },
  { id: 'marker-requests', label: 'Marker Requests', icon: Ruler, path: '/marker-requests', available: true, isSpecial: false, componentKey: 'marker-requests' },
  { id: 'reports', label: 'Reports & Analytics', icon: BarChart3, path: '/reports', available: true, isSpecial: false, componentKey: 'reports' },
  { id: 'customers', label: 'Customers', icon: Users, path: '/customers', available: false, isSpecial: false },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings', available: false, isSpecial: false },
];

export const ModernLayout: React.FC<ModernLayoutProps> = ({
  children,
  title,
  description,
  icon: Icon,
  gradient
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasAccess } = usePermissions();
  const sidebarItems = SIDEBAR_ITEMS;
  const mapWithAccess = useCallback(
    (items: SidebarItem[]): SidebarItem[] =>
      items.map((item) => {
        const childItems = item.children ? mapWithAccess(item.children) : undefined;
        const baseAvailable = item.available !== false;
        const hasPermission = !item.componentKey || hasAccess(item.componentKey);

        let computedAvailable = baseAvailable && hasPermission;
        if (childItems && childItems.length) {
          const childAvailable = childItems.some((child) => child.available !== false);
          computedAvailable = baseAvailable && (hasPermission || childAvailable);
        }

        return {
          ...item,
          children: childItems,
          available: computedAvailable,
        } satisfies SidebarItem;
      }),
    [hasAccess]
  );

  const filteredSidebarItems = useMemo(() => mapWithAccess(sidebarItems), [sidebarItems, mapWithAccess]);

  const isPathActive = useCallback((item: SidebarItem): boolean => {
    if (item.isSpecial && item.view) {
      if (location.pathname !== '/') return false;
      const currentView = new URLSearchParams(location.search).get('view');
      if (item.view === 'dashboard') {
        return !currentView || currentView === 'dashboard';
      }
      return currentView === item.view;
    }
    if (item.path) {
      return location.pathname === item.path;
    }
    if (item.children?.length) {
      return item.children.some((child) => isPathActive(child));
    }
    return false;
  }, [location.pathname, location.search]);
  const defaultExpanded = useMemo(() => {
    return sidebarItems.reduce<Record<string, boolean>>((acc, item) => {
      if (item.children?.length) {
        acc[item.id] = isPathActive(item);
      }
      return acc;
    }, {});
  }, [sidebarItems, isPathActive]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(defaultExpanded);

  useEffect(() => {
    setExpandedGroups((prev) => ({ ...defaultExpanded, ...prev }));
  }, [defaultExpanded]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleNavigate = (item: SidebarItem) => {
    if (!item.available) return;
    if (item.children?.length) {
      toggleGroup(item.id);
      return;
    }
    if (item.isSpecial && item.view) {
      navigate(`/?view=${item.view}`);
      return;
    }
    if (item.path) {
      navigate(item.path);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 flex">
      {/* Modern Sidebar */}
      <div className="w-72 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl">
        <div className="p-8">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Flow Planner</h2>
              <p className="text-slate-300 text-sm">Production Suite</p>
            </div>
          </div>
        </div>
        
        <nav className="mt-4 px-4">
          {filteredSidebarItems.map((item) => {
            const active = isPathActive(item);
            const isGroup = Boolean(item.children?.length);
            const expanded = isGroup ? expandedGroups[item.id] : false;
            return (
              <div key={item.id} className="mb-2">
                <button
                  onClick={() => handleNavigate(item)}
                  disabled={!item.available}
                  className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl text-left transition-all duration-300 group relative ${
                    active
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25'
                      : item.available
                      ? 'text-slate-300 hover:text-white hover:bg-slate-700/50 cursor-pointer'
                      : 'text-slate-500 cursor-not-allowed opacity-60'
                  }`}
                >
                  <item.icon className={`h-5 w-5 transition-transform duration-300 ${
                    active ? 'scale-110' : item.available ? 'group-hover:scale-110' : ''
                  }`} />
                  <span className="font-medium flex-1">{item.label}</span>
                  {!item.available && (
                    <span className="text-xs text-slate-500 bg-slate-700 px-2 py-1 rounded-full">Soon</span>
                  )}
                  {active && !isGroup && (
                    <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  )}
                  {isGroup && (
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>
                {isGroup && expanded && (
                  <div className="mt-1 ml-6 space-y-1">
                    {item.children!.map((child) => {
                      const childActive = isPathActive(child);
                      return (
                        <button
                          key={child.id}
                          onClick={() => handleNavigate(child)}
                          disabled={!child.available}
                          className={`w-full flex items-center space-x-3 px-5 py-2 rounded-2xl text-left text-sm transition-all duration-200 ${
                            childActive
                              ? 'bg-slate-700/80 text-white'
                              : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                          }`}
                        >
                          <child.icon className="h-4 w-4" />
                          <span>{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {/* Header Section */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-emerald-600/10"></div>
          <div className="relative px-8 py-8">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate('/')}
                    className="h-10 w-10 rounded-xl hover:bg-white/50 transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div className={`p-3 rounded-2xl ${gradient} shadow-lg`}>
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                      {title}
                    </h1>
                    <p className="text-gray-600 mt-1">{description}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="px-8 pb-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 border border-white/20 shadow-lg">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
