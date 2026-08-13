import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { getStoredUser, clearToken, clearStoredUser, isVersionMismatch, onVersionMismatch } from '../api';

function VersionBanner() {
  const [show, setShow] = useState(isVersionMismatch());

  useEffect(() => {
    return onVersionMismatch(() => setShow(true));
  }, []);

  if (!show) return null;

  return (
    <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 flex items-center justify-between">
      <span className="text-sm text-amber-800">
        A new version of PlayerEval is available.
      </span>
      <button
        onClick={() => window.location.reload()}
        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium"
      >
        Reload now
      </button>
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getStoredUser();
  const isLeadView = location.pathname.startsWith('/lead');
  const isLead = user?.isLead || false;

  const handleLogout = () => {
    clearToken();
    clearStoredUser();
    navigate('/login');
  };

  const switchView = () => {
    if (isLeadView) {
      navigate('/coach/rate');
    } else {
      navigate('/lead/players');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Version update banner */}
      <VersionBanner />

      {/* Header */}
      <header className="bg-blue-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">PlayerEval</h1>
          <div className="flex items-center gap-4">
            {isLead && (
              <button
                onClick={switchView}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm"
              >
                Switch to {isLeadView ? 'Coach' : 'Lead'} View
              </button>
            )}
            <span className="text-sm text-blue-200">{user?.name || user?.email}</span>
            <button
              onClick={handleLogout}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 flex gap-4">
          {isLeadView ? (
            <>
              <NavLink to="/lead/players" current={location.pathname}>Players</NavLink>
              <NavLink to="/lead/coaches" current={location.pathname}>Coaches</NavLink>
              <NavLink to="/lead/assignments" current={location.pathname}>Assignments</NavLink>
              <NavLink to="/lead/player-summary" current={location.pathname}>Player Summary</NavLink>
              <NavLink to="/lead/analysis" current={location.pathname}>Analysis</NavLink>
            </>
          ) : (
            <>
              <NavLink to="/coach/rate" current={location.pathname}>Rate Players</NavLink>
              <NavLink to="/coach/results" current={location.pathname}>Results</NavLink>
              <NavLink to="/coach/analysis" current={location.pathname}>Analysis</NavLink>
            </>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, current, children }: { to: string; current: string; children: React.ReactNode }) {
  const isActive = current.startsWith(to);
  return (
    <Link
      to={to}
      className={`px-3 py-2 rounded text-sm font-medium ${
        isActive
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {children}
    </Link>
  );
}
