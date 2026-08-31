import { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';
import { 
  Package, TrendingUp, AlertTriangle, 
  Search, ArrowUpDown, Check, X,
  Download, Plus, BarChart3, HelpCircle, Bell,
  ShieldCheck, FileText, Image as ImageIcon, UploadCloud,
  ChevronRight, Calendar
} from 'lucide-react';
import { stockMovementData } from '../data';
import { supabase } from '../supabase';
import { ProjectContext } from '../context/ProjectContext';

export default function ProjectDashboard({ user }) {
  const navigate = useNavigate();
  const { currentProject } = useContext(ProjectContext);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'inventory' | 'reports'

  const [dashboardData, setDashboardData] = useState({
    topProductsData: [],
    stockTableData: [],
    alerts: [],
    stats: {
      totalProducts: 0,
      totalTransactionsThisWeek: 0,
      addedThisWeek: 0,
      lowStockItems: 0,
      totalValue: '₹0.0'
    }
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Dashboard data fetching
  const fetchDashboardData = useCallback(async () => {
    if (!currentProject?.id) return;
    
    try {
      const [
        { data: products },
        { data: stock },
        { data: transactions },
        { data: alertsData }
      ] = await Promise.all([
        supabase.from('products').select('*').eq('project_id', currentProject.id),
        supabase.from('stock').select('*').eq('project_id', currentProject.id),
        supabase.from('transactions').select('*').eq('project_id', currentProject.id),
        supabase.from('alerts').select('*').eq('project_id', currentProject.id).eq('status', 'active')
      ]);

      const prods = products || [];
      const stks = stock || [];
      const txns = transactions || [];
      const alrts = alertsData || [];

      const stockTableData = stks.map(s => {
        const p = prods.find(p => p.id === s.product_id) || {};
        return {
          id: s.product_id,
          name: p.name || 'Unknown',
          category: p.category || 'General',
          qty: s.current_qty,
          threshold: s.threshold,
          unit: p.unit || 'pcs',
          lastUpdated: new Date(s.last_updated).toLocaleDateString(),
          status: s.current_qty < s.threshold ? 'Low Stock' : 'Healthy'
        };
      });

      const totalProducts = prods.length;
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const totalTransactionsThisWeek = txns.filter(t => new Date(t.timestamp) > sevenDaysAgo).length;
      const addedThisWeek = txns.filter(t => t.type === 'inward' && new Date(t.timestamp) > sevenDaysAgo).length;
      
      const lowStockItems = stks.filter(s => s.current_qty < s.threshold).length;

      // Top products
      const topProductsData = [...stockTableData]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 8)
        .map(item => ({ name: item.name, stock: item.qty }));

      // Alerts
      const mappedAlerts = alrts.map(a => {
        const p = prods.find(p => p.id === a.product_id) || {};
        return {
          id: a.id,
          text: `${p.name} is running low. Current: ${stks.find(s=>s.product_id===a.product_id)?.current_qty}, Threshold: ${stks.find(s=>s.product_id===a.product_id)?.threshold}.`,
          type: 'danger'
        };
      });

      // Total Value Mock from Qty
      const qtySum = stks.reduce((sum, s) => sum + (s.current_qty || 0), 0);
      let formattedVal = '₹0.0';
      if (qtySum > 0) {
        formattedVal = `₹${(qtySum * 3.2 / 1000).toFixed(1)}M`;
      }

      setDashboardData({
        topProductsData,
        stockTableData,
        alerts: mappedAlerts,
        stats: {
          totalProducts,
          totalTransactionsThisWeek,
          addedThisWeek,
          lowStockItems,
          totalValue: formattedVal
        }
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    if (!currentProject?.id) return;
    
    fetchDashboardData();

    const stockSubscription = supabase
      .channel(`stock-changes-${currentProject.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock', filter: `project_id=eq.${currentProject.id}` }, () => {
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(stockSubscription);
    };
  }, [currentProject?.id, fetchDashboardData]);
  
  const filteredTableData = dashboardData.stockTableData.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const dismissAlert = async (id) => {
    await supabase.from('alerts').update({ status: 'dismissed' }).eq('id', id);
    fetchDashboardData();
  };

  const handleExportCSV = () => {
    if (dashboardData.stockTableData.length === 0) return;
    
    const headers = ['Product Name', 'Category', 'Current Qty', 'Threshold', 'Last Updated', 'Status'];
    const rows = dashboardData.stockTableData.map(item => [
      item.name,
      item.category,
      item.qty,
      item.threshold,
      item.lastUpdated,
      item.status
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${currentProject?.name}_inventory_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Top Header inside panel matching Screenshot 2 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200/60 pb-3 -mt-2 mb-4 bg-white px-2 py-1 gap-4">
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`pb-3 text-sm font-semibold transition-all relative cursor-pointer ${activeTab === 'dashboard' ? 'text-blue-600 font-bold border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`pb-3 text-sm font-semibold transition-all relative cursor-pointer ${activeTab === 'inventory' ? 'text-blue-600 font-bold border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            Inventory
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`pb-3 text-sm font-semibold transition-all relative cursor-pointer ${activeTab === 'reports' ? 'text-blue-600 font-bold border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            Reports
          </button>
        </div>

        {/* Header Controls (Search, Notify, User) */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search resources..."
              className="bg-slate-50 border border-slate-200/80 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48 transition-all"
            />
          </div>
          <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors relative">
            <Bell className="w-4 h-4" />
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full absolute top-1 right-1"></span>
          </button>
          <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Title & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 font-heading tracking-tight">
            {currentProject?.name || 'Project'} Dashboard
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            {currentProject?.location || 'General'} • Updated just now
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportCSV}
            className="px-4 py-2 text-xs font-bold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" /> Export Report
          </button>
          <button 
            onClick={() => navigate('/add-stock')}
            className="btn-primary py-2 px-4 text-xs flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> New Transaction
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* KPI Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* TOTAL PRODUCTS */}
            <div className="card p-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Products</p>
                <h3 className="text-3xl font-extrabold text-slate-800 font-heading mt-1">{dashboardData.stats.totalProducts}</h3>
                <span className="text-[10px] font-bold text-green-600 flex items-center gap-0.5 mt-2 bg-green-50 px-1.5 py-0.5 rounded-md w-fit">
                  <TrendingUp className="w-3 h-3" /> +12% from last month
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100/60 shadow-xs">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            
            {/* TOTAL STOCK VALUE */}
            <div className="card p-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Stock Value</p>
                <h3 className="text-3xl font-extrabold text-slate-800 font-heading mt-1">{dashboardData.stats.totalValue}</h3>
                <span className="text-[10px] font-bold text-slate-400 mt-2 block">
                  Valuation based on current market rate
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center border border-green-100/60 shadow-xs">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </div>

            {/* ADDED THIS WEEK */}
            <div className="card p-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Added This Week</p>
                <h3 className="text-3xl font-extrabold text-slate-800 font-heading mt-1">{dashboardData.stats.totalTransactionsThisWeek}</h3>
                <span className="text-[10px] font-bold text-slate-400 mt-2 block">
                  Last update 2h ago
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100/60 shadow-xs">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
              </div>
            </div>

            {/* LOW STOCK ITEMS */}
            <div className="card p-5 flex items-center justify-between border-red-100 bg-red-50/10">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Low Stock Items</p>
                <h3 className="text-3xl font-extrabold text-red-600 font-heading mt-1">{dashboardData.stats.lowStockItems}</h3>
                <span className="text-[10px] font-bold text-red-600 mt-2 block">
                  Requires immediate attention
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center border border-red-100 shadow-xs">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </div>

          {/* Charts Row matching Screenshot 2 graphical placeholders */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* Top Products Chart Card */}
            <div className="card p-6 flex flex-col justify-between min-h-[360px]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="text-sm font-bold text-slate-800 font-heading">Top Products by Stock</h3>
                <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">•••</button>
              </div>
              
              <div className="flex-1 bg-slate-50/50 border border-slate-200/50 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <BarChart3 className="w-5 h-5 text-slate-400" />
                </div>
                <h4 className="text-xs font-bold text-slate-800">No significant data yet</h4>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Initial inventory sync in progress...</p>
              </div>
            </div>

            {/* Stock Movement Chart Card */}
            <div className="card p-6 flex flex-col justify-between min-h-[360px]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="text-sm font-bold text-slate-800 font-heading">Stock Movement (7 Days)</h3>
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
                  <button className="px-2 py-0.5 bg-white rounded-md text-slate-800 shadow-xs">All</button>
                  <button className="px-2 py-0.5 text-slate-400 hover:text-slate-600">Inbound</button>
                </div>
              </div>
              
              <div className="flex-1 bg-slate-50/50 border border-slate-200/50 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <TrendingUp className="w-5 h-5 text-slate-400" />
                </div>
                <h4 className="text-xs font-bold text-slate-800">Generating trend analysis</h4>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Waiting for more transactions</p>
              </div>
            </div>
          </div>

          {/* Active Alerts Section */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" /> Active Alerts
            </h2>
            
            {dashboardData.alerts.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {dashboardData.alerts.map(alert => (
                  <div key={alert.id} className="p-4 bg-red-50/20 border border-red-100 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                      <p className="text-xs text-slate-700 font-medium leading-relaxed">{alert.text}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        onClick={() => dismissAlert(alert.id)}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 bg-white border border-slate-200 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <X className="w-3.5 h-3.5 text-slate-500" /> Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card p-6 flex flex-col items-center justify-center text-center bg-white border border-slate-200">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-3">
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                </div>
                <h4 className="text-xs font-bold text-slate-800">Systems clear</h4>
                <p className="text-[10px] text-slate-400 mt-1">No critical stock alerts or delivery delays detected at this time.</p>
              </div>
            )}
          </div>

          {/* Bottom Grid (Site View & Upload Manifest) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Site View */}
            <div className="lg:col-span-2 card p-4 flex flex-col min-h-[260px] relative overflow-hidden group">
              <img 
                src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80" 
                alt="Warehouse Depot" 
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
              />
              {/* Glass overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent"></div>
              <div className="mt-auto relative z-10 p-2">
                <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-md tracking-wider uppercase">Site View</span>
                <h4 className="text-sm font-bold text-white mt-1.5 tracking-tight font-heading">
                  {currentProject?.location ? `${currentProject.location} Main Hub` : 'Warehouse Depot'} (Zone A)
                </h4>
              </div>
            </div>

            {/* Upload Manifest Card */}
            <div className="card p-6 bg-slate-50/30 border border-slate-200/80 flex flex-col justify-between min-h-[260px] text-center">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-4">
                  <UploadCloud className="w-6 h-6 text-blue-600" />
                </div>
                <h4 className="text-xs font-bold text-slate-800 font-heading">Upload Manifest</h4>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Drag and drop CSV or PDF documents to sync inventory.</p>
              </div>
              <button 
                onClick={() => navigate('/add-stock')}
                className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-blue-600 font-bold text-xs rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                Select Files
              </button>
            </div>
          </div>
        </>
      )}

      {activeTab === 'inventory' && (
        /* Current Stock Table View matching Screenshot 6 layout principles */
        <div className="card overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-800 font-heading">Current Stock</h2>
              <p className="text-xs text-slate-400">View current quantities and alert thresholds for this warehouse</p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search products..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-9 py-1.5 text-xs w-full sm:w-64"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/60 text-slate-400">
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Product Name</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Category</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Current Qty</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Threshold</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Last Updated</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTableData.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-800 text-xs">{item.name}</td>
                    <td className="p-4 text-xs text-slate-400">{item.category}</td>
                    <td className="p-4 text-xs">
                      <span className="font-extrabold text-slate-800">{item.qty}</span>
                      <span className="text-[10px] text-slate-400 ml-1">{item.unit}</span>
                    </td>
                    <td className="p-4 text-xs text-slate-400">{item.threshold} {item.unit}</td>
                    <td className="p-4 text-xs text-slate-400">{item.lastUpdated}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${item.status === 'Healthy' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredTableData.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                      {dashboardData.stockTableData.length === 0 ? "No products added yet. Upload a bill to get started." : "No products found matching your search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        /* Reports tab */
        <div className="card p-8 text-center max-w-lg mx-auto">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-800 font-heading">Reports & Analytics</h3>
          <p className="text-slate-500 text-xs mt-1 mb-6">Download compiled reports, audits, and performance indicators below.</p>
          <div className="space-y-3">
            <button 
              onClick={handleExportCSV}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 leading-tight">Stock Inventory CSV</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Complete record of current stock items</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
            <div className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 opacity-60 text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 leading-tight">Monthly Audit Report</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Calculated compliance and health index</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
