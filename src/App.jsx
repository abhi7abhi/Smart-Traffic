import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import AuthModals from './components/AuthModals';
import HomeView from './components/HomeView';
import RouteView from './components/RouteView';
import CrashDataView from './components/CrashDataView';
import ReportCrashView from './components/ReportCrashView';
import DashboardView from './components/DashboardView';
import AboutView from './components/AboutView';
import DatabaseExplorerView from './components/DatabaseExplorerView';
import Footer from './components/Footer';
import { getCurrentUser, logoutUser } from './services/api';

function getInitialPage() {
  if (typeof window !== 'undefined') {
    const path = (window.location.pathname || '').toLowerCase();
    const hash = (window.location.hash || '').toLowerCase();
    if (path === '/admin/database' || path.startsWith('/admin/database') || hash === '#/admin/database') {
      return 'page-admin-database';
    }
    if (path === '/dashboard') return 'page-dashboard';
    if (path === '/report-crash') return 'page-report-crash';
    if (path === '/crash-data') return 'page-crash-data';
    if (path === '/about') return 'page-about';
  }
  return 'page-home';
}

export default function App() {
  const [activePage, setActivePage] = useState(getInitialPage);
  const [currentUser, setCurrentUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [dashboardRefreshTrigger, setDashboardRefreshTrigger] = useState(0);

  // Selected route from search
  const [routeFrom, setRouteFrom] = useState('Hebbal, Bengaluru');
  const [routeTo, setRouteTo] = useState('Electronic City, Bengaluru');
  const [routeFromCoords, setRouteFromCoords] = useState(null);
  const [routeToCoords, setRouteToCoords] = useState(null);

  useEffect(() => {
    const handlePopState = () => {
      setActivePage(getInitialPage());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) setCurrentUser(user);

    // Register service worker if supported
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('PWA service worker registration skipped:', err);
      });
    }
  }, []);

  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
  };

  const handleSearchRouteFromHome = (from, to, fromCoords = null, toCoords = null) => {
    setRouteFrom(from);
    setRouteTo(to);
    setRouteFromCoords(fromCoords);
    setRouteToCoords(toCoords);
    setActivePage('page-route');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-navy-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Top Navigation */}
      <Navbar
        activePage={activePage}
        setActivePage={setActivePage}
        currentUser={currentUser}
        onOpenLogin={() => setShowLogin(true)}
        onOpenRegister={() => setShowRegister(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {activePage === 'page-home' && (
          <HomeView
            onSearchRoute={handleSearchRouteFromHome}
            onNavigate={(page) => setActivePage(page)}
          />
        )}

        {activePage === 'page-route' && (
          <RouteView
            initialFrom={routeFrom}
            initialTo={routeTo}
            initialFromCoords={routeFromCoords}
            initialToCoords={routeToCoords}
          />
        )}

        {activePage === 'page-crash-data' && (
          <CrashDataView
            currentUser={currentUser}
            onOpenLogin={() => setShowLogin(true)}
            onOpenRegister={() => setShowRegister(true)}
            onNavigate={(page) => setActivePage(page)}
            refreshTrigger={dashboardRefreshTrigger}
          />
        )}

        {activePage === 'page-report-crash' && (
          <ReportCrashView
            currentUser={currentUser}
            onOpenLogin={() => setShowLogin(true)}
            onOpenRegister={() => setShowRegister(true)}
            onNavigate={(page) => setActivePage(page)}
            onReportSuccess={() => {
              setDashboardRefreshTrigger((prev) => prev + 1);
            }}
          />
        )}

        {activePage === 'page-dashboard' && (
          <DashboardView
            currentUser={currentUser}
            onOpenLogin={() => setShowLogin(true)}
            onOpenRegister={() => setShowRegister(true)}
            refreshTrigger={dashboardRefreshTrigger}
          />
        )}

        {activePage === 'page-about' && (
          <AboutView
            currentUser={currentUser}
            onPlanRoute={handleSearchRouteFromHome}
            onNavigate={(page) => setActivePage(page)}
            onOpenLogin={() => setShowLogin(true)}
            onOpenRegister={() => setShowRegister(true)}
          />
        )}

        {activePage === 'page-admin-database' && (
          <DatabaseExplorerView />
        )}
      </main>

      {/* Footer */}
      <Footer onNavigate={(page) => setActivePage(page)} />

      {/* Auth Modals */}
      <AuthModals
        showLogin={showLogin}
        showRegister={showRegister}
        onClose={() => { setShowLogin(false); setShowRegister(false); }}
        onSuccess={(user) => setCurrentUser(user)}
        onSwitchToRegister={() => { setShowLogin(false); setShowRegister(true); }}
        onSwitchToLogin={() => { setShowRegister(false); setShowLogin(true); }}
      />

    </div>
  );
}
