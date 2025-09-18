import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, Package, FileText, Settings, Home, Users, Factory, ShoppingCart, Sparkles, ArrowLeft, ClipboardList, Truck, Minus, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ModernLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
}

export const ModernLayout: React.FC<ModernLayoutProps> = ({
  children,
  title,
  description,
  icon: Icon,
  gradient
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/', available: true, isSpecial: false },
    { id: 'planner', label: 'Production Planner', icon: ClipboardList, path: '/', available: true, isSpecial: true, view: 'planner' },
    { id: 'materials', label: 'Raw Materials', icon: Package, path: '/materials', available: true, isSpecial: false },
    { id: 'bom', label: 'Bill of Materials', icon: Factory, path: '/bom', available: true, isSpecial: false },
    { id: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, path: '/purchase-orders', available: true, isSpecial: false },
    { id: 'goods-received', label: 'Goods Received', icon: Truck, path: '/goods-received', available: true, isSpecial: false },
    { id: 'goods-issue', label: 'Goods Issue', icon: Minus, path: '/goods-issue', available: true, isSpecial: false },
    { id: 'marker-requests', label: 'Marker Requests', icon: Ruler, path: '/marker-requests', available: true, isSpecial: false },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3, path: '/reports', available: true, isSpecial: false },
    { id: 'customers', label: 'Customers', icon: Users, path: '/customers', available: false, isSpecial: false },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings', available: false, isSpecial: false },
  ];

  const isActive = (item: any) => {
    if (item.isSpecial && item.view) {
      // For special views like scheduler/planner, check if we're on the homepage with the right view param
      return location.pathname === '/' && new URLSearchParams(location.search).get('view') === item.view;
    }
    return location.pathname === item.path;
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
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.available) {
                  if (item.isSpecial && item.view) {
                    // For special views, navigate to the homepage with query params
                    navigate(`/?view=${item.view}`);
                  } else {
                    navigate(item.path);
                  }
                }
              }}
              disabled={!item.available}
              className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl text-left transition-all duration-300 mb-2 group relative ${
                isActive(item)
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25' 
                  : item.available
                  ? 'text-slate-300 hover:text-white hover:bg-slate-700/50 cursor-pointer'
                  : 'text-slate-500 cursor-not-allowed opacity-60'
              }`}
            >
              <item.icon className={`h-5 w-5 transition-transform duration-300 ${
                isActive(item) ? 'scale-110' : item.available ? 'group-hover:scale-110' : ''
              }`} />
              <span className="font-medium">{item.label}</span>
              {!item.available && (
                <span className="ml-auto text-xs text-slate-500 bg-slate-700 px-2 py-1 rounded-full">Soon</span>
              )}
              {isActive(item) && (
                <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
              )}
            </button>
          ))}
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
