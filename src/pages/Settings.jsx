import { useState } from 'react';
import { Users, UserPlus, Shield, Check, X } from 'lucide-react';
import { mockManagers, mockAccessRequests } from '../data';

export default function Settings() {
  const [managers, setManagers] = useState(mockManagers);
  const [requests, setRequests] = useState(mockAccessRequests);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [newManager, setNewManager] = useState({
    name: '', email: '', password: '', project: 'Project Alpha'
  });

  const deactivateManager = (id) => {
    setManagers(managers.map(m => m.id === id ? { ...m, status: 'Inactive' } : m));
  };

  const handleApproveRequest = (id) => {
    setRequests(requests.filter(r => r.id !== id));
  };

  const handleRejectRequest = (id) => {
    setRequests(requests.filter(r => r.id !== id));
  };

  const handleAddManager = (e) => {
    e.preventDefault();
    const id = managers.length > 0 ? Math.max(...managers.map(m => m.id)) + 1 : 1;
    setManagers([...managers, { id, name: newManager.name, email: newManager.email, project: newManager.project, status: 'Active' }]);
    setIsModalOpen(false);
    setNewManager({ name: '', email: '', password: '', project: 'Project Alpha' });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Settings</h1>
        <p className="text-text-muted mt-1">Manage your team and access requests</p>
      </div>

      {/* Access Requests */}
      {requests.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center">
            <Shield className="w-5 h-5 mr-2 text-warning" /> Pending Access Requests
          </h2>
          <div className="grid gap-4">
            {requests.map(req => (
              <div key={req.id} className="card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-warning/30 bg-warning/5">
                <div>
                  <h3 className="font-semibold text-white">{req.managerName} <span className="text-text-muted font-normal">• {req.project}</span></h3>
                  <p className="text-sm text-text-muted mt-1">Requesting manual edit access: "{req.reason}"</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => handleRejectRequest(req.id)} className="btn-danger flex items-center py-1.5 px-3">
                    <X className="w-4 h-4 mr-1" /> Reject
                  </button>
                  <button onClick={() => handleApproveRequest(req.id)} className="btn-primary bg-success hover:bg-emerald-600 flex items-center py-1.5 px-3">
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manage Team */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-white flex items-center">
            <Users className="w-5 h-5 mr-2 text-primary" /> Manage Team
          </h2>
          <button onClick={() => setIsModalOpen(true)} className="btn-primary flex items-center text-sm py-2">
            <UserPlus className="w-4 h-4 mr-2" /> Add Manager
          </button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-navy border-b border-border">
                  <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Manager</th>
                  <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Assigned Project</th>
                  <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {managers.map(manager => (
                  <tr key={manager.id} className="border-b border-border/50 hover:bg-navy-lighter/30 transition-colors">
                    <td className="p-4">
                      <p className="font-medium text-white">{manager.name}</p>
                      <p className="text-xs text-text-muted">{manager.email}</p>
                    </td>
                    <td className="p-4 text-sm text-text-main">{manager.project}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${manager.status === 'Active' ? 'bg-success/10 text-success border-success/20' : 'bg-text-muted/10 text-text-muted border-text-muted/20'}`}>
                        {manager.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {manager.status === 'Active' && (
                        <button onClick={() => deactivateManager(manager.id)} className="text-xs text-danger hover:text-red-400 font-medium transition-colors">
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Manager Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-navy/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-navy-light border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Add New Manager</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-text-muted hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddManager} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-muted">Full Name</label>
                <input required type="text" value={newManager.name} onChange={e => setNewManager({...newManager, name: e.target.value})} className="input-field" placeholder="e.g. Amit Kumar" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-muted">Email Address</label>
                <input required type="email" value={newManager.email} onChange={e => setNewManager({...newManager, email: e.target.value})} className="input-field" placeholder="amit@demo.com" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-muted">Temporary Password</label>
                <input required type="text" value={newManager.password} onChange={e => setNewManager({...newManager, password: e.target.value})} className="input-field" placeholder="Password" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-muted">Assign Project</label>
                <select value={newManager.project} onChange={e => setNewManager({...newManager, project: e.target.value})} className="input-field appearance-none">
                  <option value="Project Alpha">Project Alpha</option>
                  <option value="Project Beta">Project Beta</option>
                  <option value="Project Gamma">Project Gamma</option>
                  <option value="Project Delta">Project Delta</option>
                </select>
              </div>
              <div className="space-y-1.5 pt-2">
                <label className="text-sm font-medium text-text-muted">Role</label>
                <input type="text" value="Manager" disabled className="input-field bg-navy-lighter text-text-muted cursor-not-allowed opacity-70" />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
