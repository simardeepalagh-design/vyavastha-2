import { useState } from 'react';
import { Package } from 'lucide-react';
import { supabase } from '../supabase';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    
    if (signInError) {
      setError("Invalid email or password");
      return;
    }

    if (data?.user) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();
        
      if (userData) {
        onLogin({
          id: data.user.id,
          role: userData.role || 'manager',
          name: userData.name || data.user.email,
          email: data.user.email,
          admin_id: userData.admin_id,
          project_id: userData.project_id
        });
      } else {
        // Fallback if user not in users table — role defaults to manager
        onLogin({
          id: data.user.id,
          role: 'manager',
          name: data.user.email,
          email: data.user.email
        });
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy p-4">
      <div className="card w-full max-w-md p-8 relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/20 blur-[80px] rounded-full pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-navy border border-border rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">StockSense</h1>
          <p className="text-text-muted mt-2 text-sm">Enterprise Inventory Management</p>
        </div>

        <form onSubmit={handleSubmit} className="relative z-10 space-y-6">
          {error && (
            <div className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-lg text-sm text-center">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="admin@demo.com or manager@demo.com"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="admin123 or manager123"
              required
            />
          </div>

          <button type="submit" className="btn-primary w-full py-3 text-lg mt-4 shadow-[0_0_15px_rgba(59,130,246,0.4)] hover:shadow-[0_0_25px_rgba(59,130,246,0.6)]">
            Sign In
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-border text-center">
          <p className="text-xs text-text-muted">
            Sign in with your registered account credentials.
          </p>
        </div>
      </div>
    </div>
  );
}
