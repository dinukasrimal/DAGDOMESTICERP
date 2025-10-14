import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { ProductionPlanner } from '@/components/ProductionPlanner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/usePermissions';
import {
  ClipboardList,
  BarChart3,
  Package,
  Factory,
  ShoppingCart,
  Truck,
  Minus,
  Ruler,
  Sparkles,
  ArrowRight,
  Activity,
  FileText,
} from 'lucide-react';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasAccess } = usePermissions();

  const initialView = useMemo(() => {
    const viewParam = searchParams.get('view');
    if (viewParam && viewParam === 'planner') return 'planner';
    return 'dashboard';
  }, [searchParams]);

  const [activeView, setActiveView] = useState<'dashboard' | 'planner'>(initialView);

  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam && viewParam === 'planner') {
      setActiveView('planner');
    } else {
      setActiveView('dashboard');
    }
  }, [searchParams]);

  const showPlanner = hasAccess('planner');

  const handleSelectDashboard = () => {
    setActiveView('dashboard');
    setSearchParams({});
  };

  const handleSelectPlanner = () => {
    if (!showPlanner) return;
    setActiveView('planner');
    setSearchParams({ view: 'planner' });
  };

  const currentTitle = activeView === 'planner' ? 'Production Planner' : 'Operations Dashboard';
  const currentDescription = activeView === 'planner'
    ? 'Drag and drop purchase orders across production lines to balance workloads in real time.'
    : 'Monitor production performance and launch into the tools your team uses most.';

  const dashboardCards = [
    {
      title: 'Production Planner',
      description: 'Drag & drop purchase orders to production lines for optimal planning.',
      icon: ClipboardList,
      gradient: 'bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700',
      accentColor: 'from-indigo-500/20 to-indigo-600/20',
      onClick: handleSelectPlanner,
      disabled: !showPlanner,
    },
    {
      title: 'Reports & Analytics',
      description: 'View comprehensive reports on sales, inventory, and production metrics.',
      icon: BarChart3,
      gradient: 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700',
      accentColor: 'from-emerald-500/20 to-emerald-600/20',
      onClick: () => navigate('/reports'),
      disabled: !hasAccess('reports'),
    },
    {
      title: 'Raw Materials Management',
      description: 'Manage raw materials, units, and inventory tracking.',
      icon: Package,
      gradient: 'bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700',
      accentColor: 'from-purple-500/20 to-purple-600/20',
      onClick: () => navigate('/materials'),
      disabled: !hasAccess('materials'),
    },
    {
      title: 'Bill of Materials (BOM)',
      description: 'Create and manage product BOMs with material requirements.',
      icon: Factory,
      gradient: 'bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700',
      accentColor: 'from-orange-500/20 to-orange-600/20',
      onClick: () => navigate('/bom'),
      disabled: !hasAccess('bom'),
    },
    {
      title: 'Purchase Orders',
      description: 'Create and manage purchase orders for raw materials.',
      icon: ShoppingCart,
      gradient: 'bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700',
      accentColor: 'from-blue-500/20 to-blue-600/20',
      onClick: () => navigate('/purchase-orders'),
      disabled: !hasAccess('purchase-orders'),
    },
    {
      title: 'Goods Received',
      description: 'Receive and track incoming raw materials.',
      icon: Truck,
      gradient: 'bg-gradient-to-br from-green-500 via-green-600 to-green-700',
      accentColor: 'from-green-500/20 to-green-600/20',
      onClick: () => navigate('/goods-received'),
      disabled: !hasAccess('goods-received'),
    },
    {
      title: 'Goods Issue',
      description: 'Issue raw materials for production and other purposes.',
      icon: Minus,
      gradient: 'bg-gradient-to-br from-red-500 via-red-600 to-red-700',
      accentColor: 'from-red-500/20 to-red-600/20',
      onClick: () => navigate('/goods-issue'),
      disabled: !hasAccess('goods-issue'),
    },
    {
      title: 'Marker Requests',
      description: 'Build marker plans by combining purchase orders and layers.',
      icon: Ruler,
      gradient: 'bg-gradient-to-br from-rose-500 via-rose-600 to-orange-600',
      accentColor: 'from-rose-500/20 to-orange-500/20',
      onClick: () => navigate('/marker-requests'),
      disabled: !hasAccess('marker-requests'),
    },
    {
      title: 'Compliance Monitor',
      description: 'Stay ahead of production bottlenecks with real-time alerts (coming soon).',
      icon: Activity,
      gradient: 'bg-gradient-to-br from-slate-500 via-slate-600 to-slate-700',
      accentColor: 'from-slate-500/20 to-slate-600/20',
      onClick: () => {},
      disabled: true,
    },
  ];

  const renderDashboard = () => (
    <div className="space-y-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant={activeView === 'dashboard' ? 'default' : 'outline'} onClick={handleSelectDashboard}>
            Dashboard
          </Button>
          <Button
            variant={activeView === 'planner' ? 'default' : 'outline'}
            onClick={handleSelectPlanner}
            disabled={!showPlanner}
          >
            Production Planner
          </Button>
          {!showPlanner && (
            <Badge variant="outline" className="ml-2 text-xs">No access</Badge>
          )}
        </div>
        <div className="hidden md:flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">On-Time Orders</p>
            <p className="text-2xl font-semibold text-emerald-500">92%</p>
          </div>
          <div className="w-px h-10 bg-muted" />
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Fabric Availability</p>
            <p className="text-2xl font-semibold text-indigo-500">14 days</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {dashboardCards.map((card) => (
          <Card
            key={card.title}
            onClick={() => !card.disabled && card.onClick()}
            className={`group relative overflow-hidden transition-all duration-300 ${card.disabled ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-1 hover:shadow-lg'}`}
          >
            <div className={`absolute inset-0 ${card.accentColor} opacity-60 blur-xl`}></div>
            <CardHeader className="relative">
              <div className={`inline-flex items-center justify-center p-3 rounded-2xl shadow-md ${card.gradient}`}>
                <card.icon className="h-6 w-6 text-white" />
              </div>
              <CardTitle className="mt-5 text-xl font-semibold flex items-center justify-between">
                <span>{card.title}</span>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" />
              </CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <div className="flex items-center justify-between">
                <Button
                  className={`${card.gradient} text-white border-0 px-6`}
                  disabled={card.disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!card.disabled) card.onClick();
                  }}
                >
                  Launch
                </Button>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className={`w-2 h-2 ${card.disabled ? 'bg-muted' : 'bg-emerald-400'} rounded-full`} />
                  <span>{card.disabled ? 'Unavailable' : 'Active'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-r from-gray-800 to-gray-900">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Jump into frequently used modules.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <Button
              variant="outline"
              className={`h-24 flex flex-col items-center justify-center space-y-3 ${!showPlanner ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={handleSelectPlanner}
              disabled={!showPlanner}
            >
              <ClipboardList className="h-7 w-7" />
              <span className="font-medium">Production Planner</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col items-center justify-center space-y-3" onClick={() => navigate('/materials')}>
              <Package className="h-7 w-7" />
              <span className="font-medium">Raw Materials</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col items-center justify-center space-y-3" onClick={() => navigate('/bom')}>
              <Factory className="h-7 w-7" />
              <span className="font-medium">BOM Manager</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col items-center justify-center space-y-3" onClick={() => navigate('/reports')}>
              <FileText className="h-7 w-7" />
              <span className="font-medium">Generate Reports</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col items-center justify-center space-y-3" onClick={() => navigate('/goods-received')}>
              <Truck className="h-7 w-7" />
              <span className="font-medium">Receive Goods</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col items-center justify-center space-y-3" onClick={() => navigate('/marker-requests')}>
              <Ruler className="h-7 w-7" />
              <span className="font-medium">Marker Requests</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <ModernLayout
      title={currentTitle}
      description={currentDescription}
      icon={activeView === 'planner' ? ClipboardList : Sparkles}
      gradient={activeView === 'planner' ? 'bg-gradient-to-r from-indigo-500 to-purple-500' : 'bg-gradient-to-r from-slate-900 to-slate-700'}
    >
      {activeView === 'planner' ? <ProductionPlanner /> : renderDashboard()}
    </ModernLayout>
  );
};

export default Index;
