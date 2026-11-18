import React, { useState } from 'react';

export default function Navbar({ activePage, setActivePage, currentUser, onOpenLogin, onOpenRegister, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    {
      id: 'page-home',
      label: 'Home',
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
      ),
    },
    {
      id: 'page-crash-data',
      label: 'Crash Data',
      icon: (
        <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      id: 'page-report-crash',
      label: 'Report Crash',
      icon: (
        <span className="text-base font-bold leading-none select-none text-slate-300">+</span>
      ),
    },
    {
      id: 'page-dashboard',
      label: 'Dashboard',
      icon: (
        <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  const handleNavClick = (id) => {
    setActivePage(id);
    if (typeof window !== 'undefined') {
      if (id === 'page-home' && window.location.pathname !== '/') {
        window.history.pushState({}, '', '/');
      } else if (id === 'page-crash-data' && window.location.pathname !== '/crash-data') {
        window.history.pushState({}, '', '/crash-data');
      } else if (id === 'page-report-crash' && window.location.pathname !== '/report-crash') {
        window.history.pushState({}, '', '/report-crash');
      } else if (id === 'page-dashboard' && window.location.pathname !== '/dashboard') {
        window.history.pushState({}, '', '/dashboard');
      }
    }
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#070d1e]/95 backdrop-blur-md border-b border-slate-800/80 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Brand Logo - Map icon with red dot + Smart Traffic + Bengaluru subtitle */}
          <div 
            onClick={() => handleNavClick('page-home')} 
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#0b142a] border border-blue-500/30 flex items-center justify-center shadow-md relative overflow-hidden group-hover:border-blue-400 transition-colors">
              {/* Folded Map SVG */}
              <svg className="w-6 h-6 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" fill="rgba(6, 182, 212, 0.15)" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
              {/* Red Target Pin in center */}
              <div className="absolute w-2 h-2 rounded-full bg-rose-500 border border-white shadow-sm" />
            </div>

            <div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-white block leading-tight">
                Smart Traffic
              </span>
              <span className="text-[11px] text-slate-400 font-medium block -mt-0.5">
                Bengaluru
              </span>
            </div>
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-1.5" id="topbarNav">
            {navItems.map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all flex items-center gap-2 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* User Auth Controls */}
          <div className="hidden sm:flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-3 bg-navy-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white shadow-inner">
                  {currentUser.name ? currentUser.name[0].toUpperCase() : 'U'}
                </div>
                <div className="text-left text-xs">
                  <div className="text-white font-semibold truncate max-w-[110px]">{currentUser.name}</div>
                  <div className="text-[10px] text-emerald-400 font-medium">Logged In</div>
                </div>
                <button
                  onClick={onLogout}
                  className="ml-2 text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors"
                  title="Sign out"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 bg-navy-900/90 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Sign In</span>
              </button>
            )}
          </div>

          {/* Mobile Hamburger Menu Toggle */}
          <div className="flex items-center md:hidden">
            <button
              id="btnMobileMenuToggle"
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="btn-mobile-menu-toggle p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 focus:outline-none [touch-action:manipulation]"
              aria-label="Toggle Navigation Menu"
              aria-expanded={mobileOpen}
            >
              <div className="w-6 h-5 flex flex-col justify-between items-center">
                <span className={`hamburger-bar w-6 h-0.5 bg-current rounded origin-center transition-all ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
                <span className={`hamburger-bar w-6 h-0.5 bg-current rounded origin-center transition-all ${mobileOpen ? 'opacity-0' : ''}`} />
                <span className={`hamburger-bar w-6 h-0.5 bg-current rounded origin-center transition-all ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
              </div>
            </button>
          </div>

        </div>
      </header>

      {/* Mobile Drawer Menu & Backdrop */}
      {mobileOpen && (
        <div 
          id="mobileNavBackdrop" 
          className="mobile-nav-backdrop fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div 
        className={`topbar-nav fixed top-16 left-0 right-0 z-40 bg-[#070d1e]/98 border-b border-slate-800 px-6 py-5 md:hidden transition-all duration-300 ${
          mobileOpen ? 'mobile-open translate-y-0 opacity-100 shadow-2xl' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col gap-2">
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-3 ${
                  isActive
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-4 mt-2 border-t border-slate-800/80 flex flex-col gap-2">
            {currentUser ? (
              <div className="flex items-center justify-between px-2 py-1">
                <div className="text-xs">
                  <span className="text-slate-400 block">Signed in as</span>
                  <span className="text-white font-bold">{currentUser.name}</span>
                </div>
                <button
                  onClick={() => { onLogout(); setMobileOpen(false); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { onOpenLogin(); setMobileOpen(false); }}
                  className="w-full py-2.5 text-center rounded-lg text-xs font-semibold bg-slate-800 text-white border border-slate-700"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { onOpenRegister(); setMobileOpen(false); }}
                  className="w-full py-2.5 text-center rounded-lg text-xs font-semibold bg-blue-600 text-white"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
