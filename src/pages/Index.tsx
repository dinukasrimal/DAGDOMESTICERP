
import React, { useState } from 'react';
import { ProductionPlanner } from '../components/ProductionPlanner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Package, FileText, Settings, Home, Users, TrendingUp, Sparkles, ArrowRight, ClipboardList, Factory, ShoppingCart, Truck, Minus, Ruler } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeView, setActiveView] = useState(() => {
    const view = searchParams.get('view');
    return view && ['dashboard', 'planner'].includes(view) ? view : 'dashboard';
  });

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, onClick: () => {
      setActiveView('dashboard');
      setSearchParams({});
    }},
    { id: 'planner', label: 'Production Planner', icon: ClipboardList, onClick: () => {
      setActiveView('planner');
      setSearchParams({ view: 'planner' });
    }},
    { id: 'materials', label: 'Raw Materials', icon: Package, onClick: () => navigate('/materials') },
    { id: 'bom', label: 'Bill of Materials', icon: Factory, onClick: () => navigate('/bom') },
    { id: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, onClick: () => navigate('/purchase-orders') },
    { id: 'goods-received', label: 'Goods Received', icon: Truck, onClick: () => navigate('/goods-received') },
    { id: 'goods-issue', label: 'Goods Issue', icon: Minus, onClick: () => navigate('/goods-issue') },
    { id: 'marker-requests', label: 'Marker Requests', icon: Ruler, onClick: () => navigate('/marker-requests') },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3, onClick: () => navigate('/reports') },
    { id: 'customers', label: 'Customers', icon: Users, onClick: () => {}, disabled: true },
    { id: 'settings', label: 'Settings', icon: Settings, onClick: () => {}, disabled: true },
  ];

  // Listen for URL changes to update active view
  React.useEffect(() => {
    const view = searchParams.get('view');
    if (view && ['dashboard', 'planner'].includes(view)) {
      setActiveView(view);
    } else {
      setActiveView('dashboard');
    }
  }, [searchParams]);

  const dashboardCards = [
    {
      title: 'Production Planner',
      description: 'Drag & drop purchase orders to production lines for optimal planning',
      icon: ClipboardList,
      gradient: 'bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700',
      accentColor: 'from-indigo-500/20 to-indigo-600/20',
      onClick: () => setActiveView('planner')
    },
    {
      title: 'Reports & Analytics',
      description: 'View comprehensive reports on sales, inventory, and production metrics',
      icon: BarChart3,
      gradient: 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700',
      accentColor: 'from-emerald-500/20 to-emerald-600/20',
      onClick: () => navigate('/reports')
    },
    {
      title: 'Raw Materials Management',
      description: 'Manage raw materials, units, and inventory tracking',
      icon: Package,
      gradient: 'bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700',
      accentColor: 'from-purple-500/20 to-purple-600/20',
      onClick: () => navigate('/materials')
    },
    {
      title: 'Bill of Materials (BOM)',
      description: 'Create and manage product BOMs with material requirements',
      icon: Factory,
      gradient: 'bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700',
      accentColor: 'from-orange-500/20 to-orange-600/20',
      onClick: () => navigate('/bom')
    },
    {
      title: 'Purchase Orders',
      description: 'Create and manage purchase orders for raw materials',
      icon: ShoppingCart,
      gradient: 'bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700',
      accentColor: 'from-blue-500/20 to-blue-600/20',
      onClick: () => navigate('/purchase-orders')
    },
    {
      title: 'Goods Received',
      description: 'Receive and track incoming raw materials',
      icon: Truck,
      gradient: 'bg-gradient-to-br from-green-500 via-green-600 to-green-700',
      accentColor: 'from-green-500/20 to-green-600/20',
      onClick: () => navigate('/goods-received')
    },
    {
      title: 'Goods Issue',
      description: 'Issue raw materials for production and other purposes',
      icon: Minus,
      gradient: 'bg-gradient-to-br from-red-500 via-red-600 to-red-700',
      accentColor: 'from-red-500/20 to-red-600/20',
      onClick: () => navigate('/goods-issue')
    },
    {
      title: 'Marker Requests',
      description: 'Build marker plans by combining purchase orders and layers',
      icon: Ruler,
      gradient: 'bg-gradient-to-br from-rose-500 via-rose-600 to-orange-600',
      accentColor: 'from-rose-500/20 to-orange-500/20',
      onClick: () => navigate('/marker-requests')
    }
  ];

  const renderDashboard = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-emerald-600/10"></div>
        <div className="relative px-8 py-12">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                  Production Dashboard
                </h1>
                <p className="text-lg text-gray-600 mt-2">
                  Streamline your operations with intelligent insights
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Cards Grid */}
      <div className="px-8 pb-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            {dashboardCards.map((card) => (
              <Card 
                key={card.title}
                className="group cursor-pointer border-0 bg-white/80 backdrop-blur-sm hover:bg-white hover:shadow-2xl hover:shadow-black/10 transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                onClick={card.onClick}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${card.accentColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                <CardHeader className="relative pb-4">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`p-4 rounded-2xl ${card.gradient} shadow-lg group-hover:shadow-xl transition-shadow duration-300`}>
                        <card.icon className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 group-hover:text-gray-800 transition-colors">
                          {card.title}
                        </h3>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all duration-300" />
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-base leading-relaxed mt-3">
                    {card.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative pt-0">
                  <div className="flex items-center justify-between">
                    <Button 
                      className={`${card.gradient} hover:shadow-lg hover:shadow-black/20 text-white border-0 px-6 py-2 transition-all duration-300`}
                      onClick={(e) => {
                        e.stopPropagation();
                        card.onClick();
                      }}
                    >
                      Launch
                    </Button>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span>Active</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Actions Section */}
          <div className="bg-white/60 backdrop-blur-sm rounded-3xl p-8 border border-white/20 shadow-lg">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 rounded-xl bg-gradient-to-r from-gray-800 to-gray-900">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Quick Actions</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
              <Button 
                variant="outline" 
                className="h-24 flex flex-col items-center justify-center space-y-3 bg-white/80 hover:bg-white border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-300 group"
                onClick={() => setActiveView('planner')}
              >
                <ClipboardList className="h-7 w-7 text-indigo-600 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium text-gray-700 group-hover:text-indigo-600 transition-colors">Production Planner</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-24 flex flex-col items-center justify-center space-y-3 bg-white/80 hover:bg-white border-gray-200 hover:border-purple-300 hover:shadow-lg transition-all duration-300 group"
                onClick={() => navigate('/materials')}
              >
                <Package className="h-7 w-7 text-purple-600 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium text-gray-700 group-hover:text-purple-600 transition-colors">Raw Materials</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-24 flex flex-col items-center justify-center space-y-3 bg-white/80 hover:bg-white border-gray-200 hover:border-orange-300 hover:shadow-lg transition-all duration-300 group"
                onClick={() => navigate('/bom')}
              >
                <Factory className="h-7 w-7 text-orange-600 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium text-gray-700 group-hover:text-orange-600 transition-colors">BOM Manager</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-24 flex flex-col items-center justify-center space-y-3 bg-white/80 hover:bg-white border-gray-200 hover:border-emerald-300 hover:shadow-lg transition-all duration-300 group"
                onClick={() => navigate('/reports')}
              >
                <FileText className="h-7 w-7 text-emerald-600 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium text-gray-700 group-hover:text-emerald-600 transition-colors">Generate Reports</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-24 flex flex-col items-center justify-center space-y-3 bg-white/80 hover:bg-white border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all duration-300 group"
                onClick={() => {}}
              >
                <ShoppingCart className="h-7 w-7 text-gray-600 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium text-gray-700 group-hover:text-gray-600 transition-colors">Inventory Status</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-24 flex flex-col items-center justify-center space-y-3 bg-white/80 hover:bg-white border-gray-200 hover:border-rose-300 hover:shadow-lg transition-all duration-300 group"
                onClick={() => navigate('/marker-requests')}
              >
                <Ruler className="h-7 w-7 text-rose-600 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium text-gray-700 group-hover:text-rose-600 transition-colors">Marker Requests</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white flex">
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
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              disabled={item.disabled}
              className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl text-left transition-all duration-300 mb-2 group ${
                activeView === item.id 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25' 
                  : item.disabled
                  ? 'text-slate-500 cursor-not-allowed opacity-60'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <item.icon className={`h-5 w-5 transition-transform duration-300 ${
                activeView === item.id ? 'scale-110' : !item.disabled ? 'group-hover:scale-110' : ''
              }`} />
              <span className="font-medium">{item.label}</span>
              {item.disabled && (
                <span className="ml-auto text-xs text-slate-500 bg-slate-700 px-2 py-1 rounded-full">Soon</span>
              )}
              {activeView === item.id && (
                <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {activeView === 'dashboard' && renderDashboard()}
        {activeView === 'planner' && <ProductionPlanner />}
      </div>
    </div>
  );
};

export default Index;
