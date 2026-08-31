import { useState } from 'react';
import { Eye, EyeOff, Package } from 'lucide-react';
import { supabase } from '../supabase';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      const { data: userData } = await supabase
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
          created_by: userData.created_by,
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
    <div className="min-h-screen flex items-center justify-center p-4 font-sans">
      <div className="card w-full max-w-md p-8 relative overflow-hidden bg-white border border-slate-200 shadow-2xl rounded-3xl">
        {/* Decorative background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-blue-500/5 blur-[80px] rounded-full pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
            <Package className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 font-heading tracking-tight">Vyavastha</h1>
          <p className="text-slate-400 mt-1 text-xs">Enterprise Inventory Management</p>
        </div>

        <form onSubmit={handleSubmit} className="relative z-10 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-xs text-center font-bold">
              {error}
            </div>
          )}
          
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field mt-1"
              placeholder="name@example.com"
              required
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
            <div className="relative mt-1">
              <input 
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pr-12"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary w-full py-3 mt-6 shadow-md shadow-blue-500/10">
            Sign In
          </button>
        </form>

        <div className="mt-8 pt-5 border-t border-slate-100 text-center">
          <p className="text-[10px] font-bold text-slate-400">
            Sign in with your registered account credentials.
          </p>
        </div>
      </div>
    </div>
  );
}