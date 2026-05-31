import { useState, useEffect, useCallback, useContext } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';
import { 
  Package, DollarSign, TrendingUp, AlertTriangle, 
  Search, ArrowUpDown, Check, X, ShieldAlert
} from 'lucide-react';
import { stockMovementData } from '../data';
import { supabase } from '../supabase';
import { ProjectContext } from '../context/ProjectContext';

export default function ProjectDashboard({ user }) {
  const { currentProject } = useContext(ProjectContext);
  const [dashboardData, setDashboardData] = useState({
    topProductsData: [],
    stockTableData: [],
    alerts: [],
    stats: {
      totalProducts: 0,
      totalTransactionsThisWeek: 0,
      addedThisWeek: 0,
      lowStockItems: 0
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

      const topProductsData = [...stockTableData]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 8)
        .map(item => ({ name: item.name, stock: item.qty }));

      const mappedAlerts = alrts.map(a => {
        const p = prods.find(p => p.id === a.product_id) || {};
        return {
          id: a.id,
          text: `${p.name} is running low. Current: ${stks.find(s=>s.product_id===a.product_id)?.current_qty}, Threshold: ${stks.find(s=>s.product_id===a.product_id)?.threshold}.`,
          type: 'danger'
        };
      });

      setDashboardData({
        topProductsData,
        stockTableData,
        alerts: mappedAlerts,
        stats: {
          totalProducts,
          totalTransactionsThisWeek,
          addedThisWeek,
          lowStockItems
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{currentProject?.name} Dashboard</h1>
          <p className="text-text-muted mt-1">{currentProject?.location}{currentProject?.location ? ' • ' : ''}Updated just now</p>
        </div>
        {user.role === 'manager' && (
          <button className="btn-secondary flex items-center text-sm">
            <ShieldAlert className="w-4 h-4 mr-2" /> Request Access
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-muted">Total Products</h3>
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{dashboardData.stats.totalProducts}</p>
        </div>
        
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-muted">Total Txns This Week</h3>
            <div className="p-2 bg-success/10 text-success rounded-lg">
              <ArrowUpDown className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{dashboardData.stats.totalTransactionsThisWeek}</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-muted">Added This Week</h3>
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{dashboardData.stats.addedThisWeek}</p>
        </div>

        <div className="card p-5 border-danger/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-danger/5 rounded-bl-full pointer-events-none"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="text-sm font-medium text-text-muted">Low Stock Items</h3>
            <div className="p-2 bg-danger/10 text-danger rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-danger relative z-10">{dashboardData.stats.lowStockItems}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-bold text-white mb-6">Top Products by Stock</h3>
          {dashboardData.topProductsData.length === 0 ? (
            <div className="h-[300px] w-full flex items-center justify-center border border-border rounded-lg bg-navy/50">
              <p className="text-text-muted">No data yet</p>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={10} minHeight={300}>
                <BarChart data={dashboardData.topProductsData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    cursor={{ fill: '#1E293B' }} 
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px' }}
                  />
                  <Bar dataKey="stock" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-bold text-white mb-6">Stock Movement (7 Days)</h3>
          {stockMovementData.length === 0 ? (
            <div className="h-[300px] w-full flex items-center justify-center border border-border rounded-lg bg-navy/50">
              <p className="text-text-muted">No data yet</p>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={10} minHeight={300}>
                <LineChart data={stockMovementData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="inward" name="Inward Stock" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="outward" name="Outward Stock" stroke="#EF4444" strokeWidth={3} dot={{ r: 4, fill: '#EF4444', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Alerts Panel */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white flex items-center">
          <AlertTriangle className="w-5 h-5 mr-2 text-warning" /> Active Alerts
        </h2>
        {dashboardData.alerts.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {dashboardData.alerts.map(alert => (
              <div key={alert.id} className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${alert.type === 'danger' ? 'bg-danger/5 border-danger/20' : 'bg-warning/5 border-warning/20'}`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${alert.type === 'danger' ? 'text-danger' : 'text-warning'}`} />
                  <p className="text-sm text-text-main">{alert.text}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={() => dismissAlert(alert.id)}
                    className="p-2 text-text-muted hover:text-white bg-navy hover:bg-navy-lighter rounded-lg border border-border transition-colors text-sm flex items-center"
                  >
                    <X className="w-4 h-4 mr-1" /> Dismiss
                  </button>
                  <button 
                    onClick={() => dismissAlert(alert.id)}
                    className="py-2 px-3 bg-primary text-white hover:bg-primary-hover rounded-lg transition-colors text-sm flex items-center font-medium"
                  >
                    <Check className="w-4 h-4 mr-1" /> Mark Reordered
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center border border-border rounded-xl bg-navy/50">
            <p className="text-text-muted">No active alerts</p>
          </div>
        )}
      </div>

      {/* Stock Table */}
      <div className="card overflow-hidden">
        <div className="p-4 md:p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-white">Current Stock</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search products..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-9 py-1.5 text-sm w-full sm:w-64"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-navy border-b border-border">
                <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">Product Name <ArrowUpDown className="w-3 h-3 inline ml-1" /></th>
                <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">Category</th>
                <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">Current Qty</th>
                <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">Threshold</th>
                <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">Last Updated</th>
                <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTableData.map((item, index) => (
                <tr key={item.id} className="border-b border-border/50 hover:bg-navy-lighter/30 transition-colors">
                  <td className="p-4">
                    <p className="font-medium text-white">{item.name}</p>
                  </td>
                  <td className="p-4 text-sm text-text-muted">{item.category}</td>
                  <td className="p-4">
                    <span className="font-medium text-white">{item.qty}</span>
                    <span className="text-xs text-text-muted ml-1">{item.unit}</span>
                  </td>
                  <td className="p-4 text-sm text-text-muted">{item.threshold} {item.unit}</td>
                  <td className="p-4 text-sm text-text-muted">{item.lastUpdated}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${item.status === 'Healthy' ? 'bg-success/10 text-success border-success/20' : 'bg-danger/10 text-danger border-danger/20'}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredTableData.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-text-muted">
                    {dashboardData.stockTableData.length === 0 ? "No products added yet. Upload a bill to get started." : "No products found matching your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
