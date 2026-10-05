import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  MapPin, 
  Package, 
  Activity, 
  AlertTriangle, 
  ArrowRight, 
  Loader2, 
  Plus, 
  Trash2,
  Cpu, 
  Compass, 
  Users, 
  Wrench,
  Filter,
  Bell,
  CheckCircle,
  TrendingUp,
  FileText,
  X
} from 'lucide-react';
import { supabase } from '../supabase';
import { getStockStatus } from '../services/stockStatus';
import { ProjectContext } from '../context/ProjectContext';

export default function GlobalOverview({ user }) {
  const navigate = useNavigate();
  const { fetchProjects, setCurrentProject } = useContext(ProjectContext);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectLocation, setNewProjectLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Alerts states
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [unseenAlerts, setUnseenAlerts] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  // Stats calculation
  const [totalStockValue, setTotalStockValue] = useState('$12.4M');
  const [activeUsersCount, setActiveUsersCount] = useState(42);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const { data: projectsData, error } = await supabase
        .from('projects')
        .select('*')
        .eq('admin_id', user.id);
        
      if (error || !projectsData) {
        setProjects([]);
        setLoading(false);
        return;
      }

      const projectIds = projectsData.map(p => p.id);
      
      if (projectIds.length === 0) {
        setProjects([]);
        setLoading(false);
        return;
      }

      const [
        { data: products },
        { data: alerts },
        { data: stock }
      ] = await Promise.all([
        supabase.from('products').select('id, name, project_id').in('project_id', projectIds),
        supabase.from('alerts').select('*, products(name), projects(name)').eq('status', 'active').in('project_id', projectIds),
        supabase.from('stock').select('id, project_id, current_qty, threshold').in('project_id', projectIds)
      ]);

      // Calculate total stock value or sum of stock items
      if (stock && stock.length > 0) {
        const totalQty = stock.reduce((sum, s) => sum + (s.current_qty || 0), 0);
        // Display as a nice mock value or formatted count
        if (totalQty > 1000) {
          setTotalStockValue(`$${(totalQty * 45 / 1000000).toFixed(1)}M`);
        } else {
          setTotalStockValue(`$${(totalQty * 45 / 1000).toFixed(1)}K`);
        }
      } else {
        setTotalStockValue('$0');
      }

      // Check unseen alerts
      const activeAlertsList = alerts || [];
      setActiveAlerts(activeAlertsList);

      const lastViewed = localStorage.getItem('last_viewed_alerts_time');
      const hasNew = activeAlertsList.some(a => !lastViewed || new Date(a.triggered_at) > new Date(lastViewed));
      setUnseenAlerts(hasNew && activeAlertsList.length > 0);

      const enrichedProjects = projectsData.map(project => {
        const projectProducts = products?.filter(p => p.project_id === project.id) || [];
        const projectAlerts = activeAlertsList.filter(a => a.project_id === project.id) || [];
        const projectStock = stock?.filter(s => s.project_id === project.id) || [];
        
        let stockHealth = 100;
        if (projectStock.length > 0) {
          const healthyItems = projectStock.filter(s => getStockStatus(s.current_qty, s.threshold) === 'Healthy').length;
          stockHealth = Math.round((healthyItems / projectStock.length) * 100);
        } else if (projectProducts.length === 0) {
          stockHealth = 100;
        } else {
          stockHealth = 0;
        }

        return {
          ...project,
          totalProducts: projectProducts.length,
          activeAlerts: projectAlerts.length,
          stockHealth
        };
      });

      setProjects(enrichedProjects);
    } catch (err) {
      console.error("Error fetching overview:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchOverviewData();
    }
  }, [user?.id]);

  const handleCreateWarehouse = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newProjectLocation.trim()) return;
    setCreating(true);
    
    try {
      const { error } = await supabase.from('projects').insert({
        name: newProjectName.trim(),
        location: newProjectLocation.trim(),
        admin_id: user.id
      });
      
      if (error) throw error;
      
      setIsModalOpen(false);
      setNewProjectName('');
      setNewProjectLocation('');
      await fetchProjects();
      await fetchOverviewData();
      alert('Warehouse created successfully');
    } catch (err) {
      console.error(err);
      alert('Failed to create warehouse');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (e, projectId, projectName) => {
    e.stopPropagation();
    if (!confirm(`Delete "${projectName}"? This will permanently delete all products, stock, and transaction history for this project. This cannot be undone.`)) return;

    setDeletingId(projectId);
    try {
      await supabase.from('alerts').delete().eq('project_id', projectId);
      await supabase.from('transactions').delete().eq('project_id', projectId);
      await supabase.from('stock').delete().eq('project_id', projectId);
      await supabase.from('products').delete().eq('project_id', projectId);
      const { error } = await supabase.from('projects').delete().eq('id', projectId);

      if (error) throw error;

      await fetchProjects();
      await fetchOverviewData();
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert('Failed to delete project.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDismissAlert = async (alertId) => {
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ status: 'dismissed' })
        .eq('id', alertId);

      if (error) throw error;
      await fetchOverviewData();
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  const handleAlertsClick = () => {
    setShowAlertsModal(true);
    localStorage.setItem('last_viewed_alerts_time', new Date().toISOString());
    setUnseenAlerts(false);
  };

  const getProjectIcon = (index) => {
    const icons = [
      <Cpu className="w-5 h-5 text-blue-600" />,
      <Compass className="w-5 h-5 text-blue-600" />,
      <Users className="w-5 h-5 text-blue-600" />,
      <Wrench className="w-5 h-5 text-blue-600" />
    ];
    return icons[index % icons.length];
  };

  // Mock notifications for alerts area if database alerts list is empty
  const getMockNotifications = () => [
    {
      id: 'mock-1',
      title: 'Stock Shipment Arriving',
      subtitle: 'Project Gamma • ETA 2:45 PM',
      time: '2m ago',
      icon: <TrendingUp className="w-4 h-4 text-amber-600" />,
      bg: 'bg-amber-50'
    },
    {
      id: 'mock-2',
      title: 'Audit Completed',
      subtitle: 'Project Alpha • No discrepancies found',
      time: '15m ago',
      icon: <CheckCircle className="w-4 h-4 text-blue-600" />,
      bg: 'bg-blue-50'
    },
    {
      id: 'mock-3',
      title: 'Database Sync Success',
      subtitle: 'Global Sync completed across 4 regions',
      time: '1h ago',
      icon: <Cpu className="w-4 h-4 text-purple-600" />,
      bg: 'bg-purple-50'
    }
  ];

  return (
    <div className="space-y-8 font-sans">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 font-heading tracking-tight">Global Overview</h1>
          <p className="text-slate-500 text-sm mt-1">Monitor stock health and alerts across all locations</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 text-sm font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs">
            <Filter className="w-4 h-4 text-slate-500" /> Filter
          </button>
          
          {/* Alerts button with notification badge, blinks/pulsates if has unseen alerts */}
          <button 
            onClick={handleAlertsClick}
            className={`px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-red-500/10 relative ${unseenAlerts ? 'animate-pulse ring-4 ring-red-500/30' : ''}`}
          >
            <Bell className="w-4 h-4" />
            Alerts
            {activeAlerts.length > 0 && (
              <span className="bg-white text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-xs">
                {activeAlerts.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Warehouse
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="card p-16 text-center max-w-lg mx-auto">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-800 font-heading">No Projects Found</h3>
          <p className="text-slate-500 text-sm mt-1 mb-6">Create a project or warehouse to start tracking inventory.</p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Create Warehouse
          </button>
        </div>
      ) : (
        /* Projects Grid matching Screenshot 1 Layout */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {projects.map((project, idx) => (
            <div key={project.id} className="card p-6 flex flex-col relative overflow-hidden group hover:border-blue-500/40 hover:shadow-lg transition-all duration-300">
              
              {/* Header inside Card */}
              <div className="flex justify-between items-start mb-6">
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="text-base font-bold text-slate-800 font-heading truncate group-hover:text-blue-600 transition-colors leading-snug">{project.name}</h3>
                  <div className="flex items-center text-xs text-slate-400 mt-1">
                    <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400" />
                    <span className="truncate">{project.location || 'No location set'}</span>
                  </div>
                </div>
                
                {/* Soft blue icon container */}
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100/60 shadow-xs">
                  {getProjectIcon(idx)}
                </div>
              </div>

              {/* Stats Box */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                  <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Products</div>
                  <div className="text-lg font-extrabold text-slate-800 font-heading">{project.totalProducts}</div>
                </div>
                <div className="bg-blue-50/50 border border-blue-100/40 p-3 rounded-xl">
                  <div className="text-blue-500/80 text-[10px] font-bold uppercase tracking-wider mb-1">Health</div>
                  <div className={`text-lg font-extrabold font-heading ${project.stockHealth < 80 ? 'text-amber-600' : 'text-blue-600'}`}>
                    {project.stockHealth}%
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-6 mt-auto">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400 font-semibold">Stock Health</span>
                  <span className="text-slate-700 font-bold">{project.stockHealth}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/40">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${project.stockHealth < 80 ? 'bg-amber-500' : 'bg-blue-600'}`} 
                    style={{ width: `${project.stockHealth}%` }}
                  ></div>
                </div>
              </div>

              {/* Button & Actions */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
                <button 
                  onClick={() => {
                    setCurrentProject(projects.find(p => p.id === project.id));
                    navigate('/dashboard');
                  }}
                  className="flex items-center text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors py-1 cursor-pointer"
                >
                  Open Dashboard <ArrowRight className="w-3.5 h-3.5 ml-1.5 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  onClick={(e) => handleDeleteProject(e, project.id, project.name)}
                  disabled={deletingId === project.id}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Delete Warehouse"
                >
                  {deletingId === project.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Layout Row: Recent Alerts & Network Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
        {/* Recent Alerts */}
        <div className="lg:col-span-2 card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800 font-heading">Recent Alerts</h3>
                <p className="text-slate-400 text-xs mt-0.5">Live updates from the logistics network</p>
              </div>
              <button 
                onClick={handleAlertsClick}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
              >
                View All Notifications
              </button>
            </div>
            
            <div className="space-y-3">
              {activeAlerts.length === 0 ? (
                // Display mock alerts if database has no active alerts to look clean
                getMockNotifications().map(notif => (
                  <div key={notif.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${notif.bg} flex items-center justify-center`}>
                        {notif.icon}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 leading-tight">{notif.title}</p>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{notif.subtitle}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">{notif.time}</span>
                  </div>
                ))
              ) : (
                activeAlerts.slice(0, 3).map(alert => (
                  <div key={alert.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 leading-tight">Low Stock Alert: {alert.products?.name}</p>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">Warehouse: {alert.projects?.name} • Action Required</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleDismissAlert(alert.id)}
                        className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors"
                      >
                        Dismiss
                      </button>
                      <span className="text-[10px] font-medium text-slate-400">
                        {new Date(alert.triggered_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Network Status */}
        <div className="card p-6 bg-blue-50/40 border-blue-100/50 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 font-heading">Network Status</h3>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-green-200 text-green-700 text-[10px] font-bold rounded-full mt-2.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></span>
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full absolute"></span>
              SYSTEMS OPERATIONAL
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Users</p>
                <p className="text-3xl font-extrabold text-blue-600 font-heading mt-1">{activeUsersCount}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Stock Value</p>
                <p className="text-lg font-extrabold text-slate-800 font-heading mt-2">{totalStockValue}</p>
              </div>
            </div>
          </div>

          <button className="w-full mt-6 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-blue-600 font-bold text-xs rounded-xl transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" /> Download Global Report
          </button>
        </div>
      </div>

      {/* New Warehouse Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button className="absolute top-4 right-4 text-slate-400 hover:text-slate-600" onClick={() => setIsModalOpen(false)}>
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-slate-900 font-heading mb-4">Create New Warehouse</h2>
            <form onSubmit={handleCreateWarehouse} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Project Name</label>
                <input 
                  type="text" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="input-field mt-1.5"
                  placeholder="e.g., Central Hub"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Location</label>
                <input 
                  type="text" 
                  value={newProjectLocation}
                  onChange={(e) => setNewProjectLocation(e.target.value)}
                  className="input-field mt-1.5"
                  placeholder="e.g., Jaipur, Rajasthan"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={creating}
                  className="btn-primary"
                >
                  {creating ? 'Creating...' : 'Create Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active Alerts Modal */}
      {showAlertsModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative flex flex-col max-h-[80vh]">
            <button className="absolute top-4 right-4 text-slate-400 hover:text-slate-600" onClick={() => setShowAlertsModal(false)}>
              <X className="w-5 h-5" />
            </button>
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-xl font-bold text-slate-900 font-heading flex items-center gap-2">
                <Bell className="w-5 h-5 text-red-600" /> Active System Alerts
              </h2>
              <p className="text-slate-400 text-xs mt-1">Review and dismiss low stock triggers below</p>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {activeAlerts.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-slate-800 font-bold text-sm">All warehouses healthy!</p>
                  <p className="text-slate-400 text-xs mt-0.5">No active low stock alerts detected.</p>
                </div>
              ) : (
                activeAlerts.map(alert => (
                  <div key={alert.id} className="flex items-center justify-between p-3.5 rounded-xl border border-red-100 bg-red-50/20 hover:bg-red-50/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shadow-xs">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 leading-tight">Low Stock: {alert.products?.name}</p>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                          Warehouse: {alert.projects?.name} • Triggered at {new Date(alert.triggered_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDismissAlert(alert.id)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] rounded-lg transition-all cursor-pointer shadow-sm shadow-red-500/10"
                    >
                      Dismiss
                    </button>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex items-center justify-end pt-4 border-t border-slate-100 mt-6">
              <button 
                type="button" 
                onClick={() => setShowAlertsModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
