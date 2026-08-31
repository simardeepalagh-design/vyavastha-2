import { useState, useEffect, useContext } from 'react';
import { 
  Users, 
  UserPlus, 
  X, 
  Loader2, 
  ShieldCheck, 
  Briefcase, 
  Clock, 
  User, 
  UserCheck, 
  UserX,
  Search,
  Bell,
  HelpCircle,
  MapPin,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../supabase';
import { ProjectContext } from '../context/ProjectContext';

export default function Settings({ user }) {
  const { projects } = useContext(ProjectContext);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Pending request mock visibility
  const [showPendingRequest, setShowPendingRequest] = useState(true);

  const [newManager, setNewManager] = useState({
    name: '', email: '', password: '', project_id: ''
  });

  const fetchManagers = async () => {
    setLoading(true);

    // Get all project IDs belonging to this admin
    const { data: adminProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('admin_id', user.id);

    const projectIds = adminProjects?.map(p => p.id) || [];

    if (projectIds.length === 0) {
      setManagers([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, project_id, projects(name)')
      .eq('role', 'manager')
      .in('project_id', projectIds);

    if (!error) {
      // Map to support manager role as active and inactive
      setManagers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchManagers();
  }, []);

  const toggleManagerStatus = async (id, currentRole) => {
    const isDeactivating = currentRole === 'manager';
    const newRole = isDeactivating ? 'inactive' : 'manager';
    
    if (!confirm(`${isDeactivating ? 'Deactivate' : 'Reactivate'} this manager?`)) return;

    const { error } = await supabase
      .from('users')
      .update({ role: newRole })
      .eq('id', id);

    if (error) {
      alert(`Failed to update manager status.`);
      return;
    }
    fetchManagers();
  };

  const handleAddManager = async (e) => {
    e.preventDefault();
    if (!newManager.name.trim() || !newManager.email.trim() || !newManager.password.trim() || !newManager.project_id) {
      alert('Please fill all fields.');
      return;
    }
    if (newManager.password.length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);

    try {
      const { data: adminSessionData } = await supabase.auth.getSession();
      const adminSession = adminSessionData.session;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: newManager.email.trim(),
        password: newManager.password
      });

      if (signUpError) throw signUpError;
      if (!signUpData?.user) throw new Error('Account creation failed.');

      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token
        });
      }

      const { error: insertError } = await supabase.from('users').insert({
        id: signUpData.user.id,
        name: newManager.name.trim(),
        email: newManager.email.trim(),
        role: 'manager',
        project_id: newManager.project_id,
        created_by: user.id
      });

      if (insertError) throw insertError;

      setIsModalOpen(false);
      setNewManager({ name: '', email: '', password: '', project_id: '' });
      fetchManagers();
      alert('Manager created successfully. They can log in immediately.');

    } catch (err) {
      console.error('Add manager failed:', err);
      alert(err.message || 'Failed to create manager.');
    } finally {
      setSubmitting(false);
    }
  };

  // Profile initials helper
  const getInitials = (name) => {
    if (!name) return 'M';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <div className="space-y-8 font-sans">
      
      {/* Top Header section matching Screenshot 5 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200/60 pb-3 -mt-2 mb-4 bg-white px-2 py-1 gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">Admin Settings</span>
          <span className="text-slate-300">/</span>
          <span className="text-xs font-semibold text-slate-400">Manage your team and access requests</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search settings..."
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

      {/* Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 font-heading tracking-tight">Admin Settings</h1>
        <p className="text-slate-400 text-xs mt-0.5">Manage your team and approve temporary edit credentials</p>
      </div>

      {/* Pending Access Requests Card matching Screenshot 5 */}
      {showPendingRequest && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Pending Access Requests</h2>
            <span className="bg-amber-100 border border-amber-200 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">1 NEW</span>
          </div>

          <div className="card p-5 bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-xs">
                <User className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-800">
                  Rahul Sharma <span className="text-slate-300 font-normal mx-1.5">•</span> <span className="text-slate-400 font-semibold">Project Alpha</span>
                </p>
                <p className="text-xs font-medium text-slate-500 italic">
                  "Requesting manual edit access: Wrong bill entry needs correction."
                </p>
                <div className="flex items-center gap-4 text-[10px] text-slate-400 font-semibold pt-1">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> 14 mins ago</span>
                  <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> Editor Role</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={() => { setShowPendingRequest(false); alert('Access request rejected'); }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
              >
                <UserX className="w-3.5 h-3.5 text-slate-500" /> Reject
              </button>
              <button 
                onClick={() => { setShowPendingRequest(false); alert('Access request approved'); }}
                className="btn-primary py-2 px-4 text-xs flex items-center gap-1 bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/10"
              >
                <UserCheck className="w-3.5 h-3.5" /> Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Team Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold text-slate-800 font-heading">Manage Team</h2>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn-primary text-xs flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" /> Add Manager
          </button>
        </div>

        <div className="card overflow-hidden bg-white border border-slate-200">
          {loading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : managers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">No managers added yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/60 text-slate-400">
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider">Manager</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider">Assigned Project</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider">Status</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {managers.map(manager => {
                    const isActive = manager.role === 'manager';
                    return (
                      <tr key={manager.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 font-bold text-[10px] flex items-center justify-center shadow-xs border border-blue-100">
                              {getInitials(manager.name)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-xs">{manager.name}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{manager.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-xs text-slate-800">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/50">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {manager.projects?.name || '—'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => toggleManagerStatus(manager.id, manager.role)}
                            className={`text-xs font-bold transition-colors cursor-pointer py-1 px-2.5 rounded-lg border ${
                              isActive 
                                ? 'text-red-600 hover:bg-red-50 border-red-200/50' 
                                : 'text-blue-600 hover:bg-blue-50 border-blue-200/50'
                            }`}
                          >
                            {isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">
              Showing 1-{managers.length} of {managers.length} managers
            </span>
            <div className="flex items-center gap-2">
              <button className="p-1 border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed" disabled>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="p-1 bg-blue-600 text-white rounded-lg w-7 h-7 font-bold text-xs flex items-center justify-center shadow-md shadow-blue-500/10">1</button>
              <button className="p-1 border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed" disabled>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Efficiency Banner matching Screenshot 5 */}
      <div className="card p-6 bg-slate-900 text-white flex flex-col justify-end min-h-[160px] relative overflow-hidden group rounded-2xl shadow-lg border-0">
        <img 
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80" 
          alt="Office Meeting" 
          className="absolute inset-0 w-full h-full object-cover opacity-35 scale-100 group-hover:scale-105 transition-transform duration-[8s]" 
        />
        {/* Glassmorphism gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-950/90 via-slate-900/80 to-transparent"></div>
        <div className="relative z-10 max-w-lg space-y-1">
          <h3 className="text-base font-bold font-heading tracking-tight">Team Efficiency</h3>
          <p className="text-slate-300 text-xs leading-normal">
            Manage multi-site logistics with seamless role-based access control and real-time activity tracking.
          </p>
        </div>
      </div>

      {/* Add Manager Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 font-heading">Add New Manager</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddManager} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name</label>
                <input required type="text" value={newManager.name} onChange={e => setNewManager({...newManager, name: e.target.value})} className="input-field mt-1" placeholder="e.g. Rahul Sharma" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                <input required type="email" value={newManager.email} onChange={e => setNewManager({...newManager, email: e.target.value})} className="input-field mt-1" placeholder="rahul@example.com" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Temporary Password</label>
                <input required type="text" minLength={6} value={newManager.password} onChange={e => setNewManager({...newManager, password: e.target.value})} className="input-field mt-1" placeholder="Min 6 characters" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assign Project</label>
                <select required value={newManager.project_id} onChange={e => setNewManager({...newManager, project_id: e.target.value})} className="input-field mt-1 bg-white text-slate-800">
                  <option value="">Select a project</option>
                  {projects?.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary flex-1" disabled={submitting}>Cancel</button>
                <button type="submit" className="btn-primary flex-1 flex items-center justify-center" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}