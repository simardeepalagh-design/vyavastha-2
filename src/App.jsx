import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import GlobalOverview from './pages/GlobalOverview';
import ProjectDashboard from './pages/ProjectDashboard';
import StockFlow from './pages/StockFlow';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import { supabase } from './supabase';
import { ProjectProvider } from './context/ProjectContext';

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('stocksense_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
      } catch (e) { }
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('stocksense_user', JSON.stringify(userData));
  };

const handleLogout = () => {
  setUser(null);
  localStorage.removeItem('stocksense_user');
};

return (
  <Router>
    <Routes>
      <Route
        path="/login"
        element={!user ? <Login onLogin={handleLogin} /> : <Navigate to={user.role === 'admin' ? '/' : '/dashboard'} />}
      />

      {/* Protected Routes inside Layout */}
      {user ? (
        <Route element={<ProjectProvider user={user}><Layout user={user} onLogout={handleLogout} /></ProjectProvider>}>
          {user.role === 'admin' && (
            <>
              <Route path="/" element={<GlobalOverview user={user} />} />
              <Route path="/settings" element={<Settings />} />
            </>
          )}
          {/* If manager tries to access root, redirect to dashboard */}
          {user.role === 'manager' && <Route path="/" element={<Navigate to="/dashboard" />} />}

          <Route path="/dashboard" element={<ProjectDashboard user={user} />} />
          <Route path="/add-stock" element={<StockFlow type="add" user={user} />} />
          <Route path="/deduct-stock" element={<StockFlow type="deduct" user={user} />} />
          <Route path="/transactions" element={<Transactions />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" />} />
      )}
    </Routes>
  </Router>
);
}

export default App;
