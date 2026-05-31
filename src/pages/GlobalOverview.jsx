import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Package, Activity, AlertTriangle, ArrowRight, Loader2, Plus } from 'lucide-react';
import { supabase } from '../supabase';
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
          supabase.from('products').select('id, project_id').in('project_id', projectIds),
          supabase.from('alerts').select('id, project_id').eq('status', 'active').in('project_id', projectIds),
          supabase.from('stock').select('id, project_id, current_qty, threshold').in('project_id', projectIds)
        ]);

        const enrichedProjects = projectsData.map(project => {
          const projectProducts = products?.filter(p => p.project_id === project.id) || [];
          const projectAlerts = alerts?.filter(a => a.project_id === project.id) || [];
          const projectStock = stock?.filter(s => s.project_id === project.id) || [];
          
          let stockHealth = 100;
          if (projectStock.length > 0) {
            const healthyItems = projectStock.filter(s => s.current_qty >= s.threshold).length;
            stockHealth = Math.round((healthyItems / projectStock.length) * 100);
          } else if (projectProducts.length === 0) {
            stockHealth = 100; // empty project = healthy
          } else {
             stockHealth = 0; // products exist but no stock mapped = 0
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
      await fetchProjects(); // update sidebar Context
      await fetchOverviewData(); // update local overview
      
      // Temporary simple alert for success toast requirement
      alert('Warehouse created successfully');
    } catch (err) {
      console.error(err);
      alert('Failed to create warehouse');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">All Projects Overview</h1>
          <p className="text-text-muted mt-1">Monitor stock health and alerts across all locations</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Warehouse
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-text-muted">No projects found. Create a project to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="card p-6 flex flex-col relative overflow-hidden group hover:border-primary/50 transition-colors">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">{project.name}</h3>
                  <div className="flex items-center text-sm text-text-muted mt-1">
                    <MapPin className="w-4 h-4 mr-1" />
                    {project.location || 'No location set'}
                  </div>
                </div>
                {project.activeAlerts > 0 && (
                  <div className="bg-danger/10 border border-danger/30 text-danger px-2 py-1 rounded-md flex items-center text-xs font-bold shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {project.activeAlerts} {project.activeAlerts === 1 ? 'Alert' : 'Alerts'}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-navy p-3 rounded-lg border border-border">
                  <div className="text-text-muted text-xs font-medium mb-1 flex items-center">
                    <Package className="w-3 h-3 mr-1" /> Products
                  </div>
                  <div className="text-xl font-bold text-white">{project.totalProducts}</div>
                </div>
                <div className="bg-navy p-3 rounded-lg border border-border">
                  <div className="text-text-muted text-xs font-medium mb-1 flex items-center">
                    <Activity className="w-3 h-3 mr-1" /> Health
                  </div>
                  <div className={`text-xl font-bold ${project.stockHealth < 80 ? 'text-warning' : 'text-success'}`}>
                    {project.stockHealth}%
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-muted">Stock Health</span>
                  <span className="text-white font-medium">{project.stockHealth}%</span>
                </div>
                <div className="w-full bg-navy h-2 rounded-full overflow-hidden border border-border">
                  <div 
                    className={`h-full rounded-full ${project.stockHealth < 80 ? 'bg-warning' : 'bg-success'}`} 
                    style={{ width: `${project.stockHealth}%` }}
                  ></div>
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-border">
                <button 
                  onClick={() => {
                    setCurrentProject(projects.find(p => p.id === project.id));
                    navigate('/dashboard');
                  }}
                  className="w-full flex items-center justify-center text-sm font-medium text-text-muted hover:text-primary transition-colors group-hover:text-primary py-2"
                >
                  Open Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Warehouse Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-navy/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-navy-light border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">Create New Warehouse</h2>
            <form onSubmit={handleCreateWarehouse} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-muted">Project Name</label>
                <input 
                  type="text" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="input-field mt-1"
                  placeholder="e.g., Central Hub"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-muted">Location</label>
                <input 
                  type="text" 
                  value={newProjectLocation}
                  onChange={(e) => setNewProjectLocation(e.target.value)}
                  className="input-field mt-1"
                  placeholder="e.g., Mumbai, Maharashtra"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-text-muted hover:text-white transition-colors"
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
    </div>
  );
}
