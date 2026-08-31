import { useState, useContext } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ProjectContext } from '../context/ProjectContext';
import { 
  LayoutGrid, 
  BarChart3,
  Upload,
  Download,
  History, 
  Settings as SettingsIcon, 
  LogOut, 
  Package,
  Menu,
  X,
  Loader2,
  MapPin
} from 'lucide-react';

export default function Layout({ user, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { currentProject, setCurrentProject, projects, projectsLoading } = useContext(ProjectContext);

  const closeSidebar = () => setSidebarOpen(false);

  // Helper to check if a route is active
  const isActiveRoute = (path) => location.pathname === path;

  // Initials for avatar
  const getInitials = (name) => {
    if (!name) return 'US';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <div className="min-h-screen w-full bg-white flex flex-col lg:flex-row overflow-hidden relative">
      
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

        {/* Sidebar */}
        <aside className={`fixed lg:static inset-y-0 left-0 w-64 bg-slate-50 border-r border-slate-200/80 flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          {/* Logo Section */}
          <div className="p-6 flex items-center justify-between border-b border-slate-200/60 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold text-slate-900 font-heading tracking-tight block leading-none mb-1">Vyavastha</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Enterprise Logistics</span>
              </div>
            </div>
            <button className="lg:hidden text-slate-500 hover:text-slate-900" onClick={closeSidebar}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-6">
            {/* Navigation Links */}
            <nav className="px-3 space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-3">Menu</div>
              
              {user.role === 'admin' && (
                <NavLink 
                  to="/" 
                  end
                  onClick={closeSidebar}
                  className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-4 transition-all ${isActive ? 'bg-blue-50/80 text-blue-600 border-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="text-[13px]">Global Overview</span>
                </NavLink>
              )}
              
              <NavLink 
                to="/dashboard"
                onClick={closeSidebar}
                className={() => `flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-4 transition-all ${location.pathname === '/dashboard' ? 'bg-blue-50/80 text-blue-600 border-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent'}`}
              >
                <BarChart3 className="w-4 h-4" />
                <span className="text-[13px]">Project Dashboard</span>
              </NavLink>

              <NavLink 
                to="/add-stock" 
                onClick={closeSidebar}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-4 transition-all ${isActive ? 'bg-blue-50/80 text-blue-600 border-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent'}`}
              >
                <Upload className="w-4 h-4" />
                <span className="text-[13px]">Add Stock</span>
              </NavLink>

              <NavLink 
                to="/deduct-stock" 
                onClick={closeSidebar}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-4 transition-all ${isActive ? 'bg-blue-50/80 text-blue-600 border-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent'}`}
              >
                <Download className="w-4 h-4" />
                <span className="text-[13px]">Deduct Stock</span>
              </NavLink>

              <NavLink 
                to="/transactions" 
                onClick={closeSidebar}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-4 transition-all ${isActive ? 'bg-blue-50/80 text-blue-600 border-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent'}`}
              >
                <History className="w-4 h-4" />
                <span className="text-[13px]">Transaction History</span>
              </NavLink>

              {user.role === 'admin' && (
                <NavLink 
                  to="/settings" 
                  onClick={closeSidebar}
                  className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-4 transition-all ${isActive ? 'bg-blue-50/80 text-blue-600 border-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent'}`}
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span className="text-[13px]">Settings</span>
                </NavLink>
              )}
            </nav>

            {/* Projects List */}
            <div className="px-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-3 flex items-center justify-between">
                Projects
                {projectsLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
              </div>
              <div className="space-y-1">
                {projects.length === 0 && !projectsLoading && (
                  <p className="text-xs text-slate-400 px-3 py-2">No projects found</p>
                )}
                {projects.map(project => {
                  const isActive = currentProject?.id === project.id;
                  const isLocked = user.role === 'manager' && user.project_id !== project.id;
                  
                  return (
                    <button
                      key={project.id}
                      onClick={() => {
                        if (!isLocked) {
                          setCurrentProject(project);
                          navigate('/dashboard');
                          closeSidebar();
                        }
                      }}
                      disabled={isLocked}
                      className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg border-l-4 transition-all ${
                        isActive 
                          ? 'bg-blue-50/80 text-blue-600 border-blue-600 font-semibold shadow-xs' 
                          : isLocked 
                            ? 'text-slate-400/50 border-transparent cursor-not-allowed' 
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent'
                      }`}
                      title={isLocked ? "View-only (Assigned to another manager)" : `Switch to ${project.name}`}
                    >
                      <span className="truncate text-[13px] flex items-center gap-2">
                        <MapPin className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                        {project.name} {isLocked && '🔒'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* User Profile Footer */}
          <div className="p-4 border-t border-slate-200/60 bg-white">
            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shadow-md shadow-blue-500/10">
                {getInitials(user.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate leading-tight">{user.name}</p>
                <p className="text-[10px] font-medium text-slate-400 truncate capitalize leading-tight mt-0.5">
                  {user.role === 'admin' ? 'Logistics Head' : 'Manager'}
                </p>
              </div>
              <button 
                onClick={onLogout}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50/50">
          {/* Mobile Header */}
          <header className="lg:hidden flex items-center justify-between p-4 border-b border-slate-200 bg-white z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Package className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 tracking-tight font-heading">Vyavastha</span>
            </div>
            <button 
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
          </header>

          {/* Child Routes Outlet Container */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    );
}
