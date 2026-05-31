import { useState, useContext } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ProjectContext } from '../context/ProjectContext';
import { 
  LayoutDashboard, 
  PackagePlus, 
  PackageMinus, 
  History, 
  Settings as SettingsIcon, 
  LogOut, 
  Package,
  Menu,
  X,
  Loader2
} from 'lucide-react';

export default function Layout({ user, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { currentProject, setCurrentProject, projects, projectsLoading } = useContext(ProjectContext);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-navy flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-navy/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 bg-navy-light border-r border-border flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-navy border border-border rounded-xl flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.2)]">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold text-white">StockSense</span>
          </div>
          <button className="lg:hidden text-text-muted hover:text-white" onClick={closeSidebar}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-6">
          {/* Navigation Links */}
          <nav className="px-4 space-y-1">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4 px-3">Menu</div>
            
            {user.role === 'admin' && (
              <NavLink 
                to="/" 
                end
                onClick={closeSidebar}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-navy hover:text-white'}`}
              >
                <LayoutDashboard className="w-5 h-5" />
                Global Overview
              </NavLink>
            )}
            
            <NavLink 
              to="/dashboard"
              onClick={closeSidebar}
              className={() => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${location.pathname === '/dashboard' ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-navy hover:text-white'}`}
            >
              <LayoutDashboard className="w-5 h-5" />
              Project Dashboard
            </NavLink>

            <NavLink 
              to="/add-stock" 
              onClick={closeSidebar}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-navy hover:text-white'}`}
            >
              <PackagePlus className="w-5 h-5" />
              Add Stock
            </NavLink>

            <NavLink 
              to="/deduct-stock" 
              onClick={closeSidebar}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-navy hover:text-white'}`}
            >
              <PackageMinus className="w-5 h-5" />
              Deduct Stock
            </NavLink>

            <NavLink 
              to="/transactions" 
              onClick={closeSidebar}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-navy hover:text-white'}`}
            >
              <History className="w-5 h-5" />
              Transaction History
            </NavLink>

            {user.role === 'admin' && (
              <NavLink 
                to="/settings" 
                onClick={closeSidebar}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-navy hover:text-white'}`}
              >
                <SettingsIcon className="w-5 h-5" />
                Settings
              </NavLink>
            )}
          </nav>

          {/* Projects List */}
          <div className="px-4">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4 px-3 flex items-center justify-between">
              Projects
              {projectsLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            </div>
            <div className="space-y-1">
              {projects.length === 0 && !projectsLoading && (
                <p className="text-xs text-text-muted px-3 py-2">No projects found</p>
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
                    className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors border-l-4 ${
                      isActive 
                        ? 'bg-primary/10 text-primary font-medium border-primary' 
                        : isLocked 
                          ? 'text-text-muted/50 border-transparent cursor-not-allowed' 
                          : 'text-text-muted hover:bg-navy hover:text-white border-transparent'
                    }`}
                    title={isLocked ? "View-only (Assigned to another manager)" : `Switch to ${project.name}`}
                  >
                    <span className="truncate">{project.name} {isLocked && '🔒'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between bg-navy p-3 rounded-xl border border-border">
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-text-muted capitalize truncate">{user.role}</p>
            </div>
            <button 
              onClick={onLogout}
              className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-navy-light">
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            <span className="font-bold text-white">StockSense</span>
          </div>
          <button 
            className="p-2 text-text-muted hover:text-white"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
