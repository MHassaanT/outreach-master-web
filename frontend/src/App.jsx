import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import ResearchAgent from './pages/ResearchAgent';
import Leads from './pages/Leads';
import Messaging from './pages/Messaging';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authView === 'register') {
      return <Register onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <Login onSwitchToRegister={() => setAuthView('register')} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col selection:bg-emerald-500/20 selection:text-emerald-400">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {activeTab === 'dashboard' && (
          <Dashboard 
            setActiveTab={setActiveTab} 
            setSelectedLeadId={setSelectedLeadId} 
          />
        )}
        {activeTab === 'agent' && (
          <ResearchAgent 
            setActiveTab={setActiveTab} 
            setSelectedLeadId={setSelectedLeadId} 
          />
        )}
        {activeTab === 'leads' && (
          <Leads 
            setActiveTab={setActiveTab} 
            setSelectedLeadId={setSelectedLeadId} 
          />
        )}
        {activeTab === 'messaging' && (
          <Messaging 
            selectedLeadId={selectedLeadId} 
            setSelectedLeadId={setSelectedLeadId} 
          />
        )}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
