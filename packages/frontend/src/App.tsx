import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getToken, getStoredUser } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import PlayerEntry from './pages/lead/PlayerEntry';
import CoachEntry from './pages/lead/CoachEntry';
import PlayerSummary from './pages/lead/PlayerSummary';
import CoachAssignment from './pages/lead/CoachAssignment';
import Analysis from './pages/lead/Analysis';
import RatePlayers from './pages/coach/RatePlayers';
import Results from './pages/coach/Results';
import CoachAnalysis from './pages/coach/Analysis';

function ProtectedRoute({ children, requireLead = false }: { children: React.ReactNode; requireLead?: boolean }) {
  const token = getToken();
  const user = getStoredUser();
  
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  
  if (requireLead && !user.isLead) {
    return <Navigate to="/coach/rate" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/signup" element={<SignupRedirect />} />
      
      {/* Lead routes */}
      <Route path="/lead" element={<ProtectedRoute requireLead><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/lead/players" replace />} />
        <Route path="players" element={<PlayerEntry />} />
        <Route path="coaches" element={<CoachEntry />} />
        <Route path="player-summary/:playerId" element={<PlayerSummary />} />
        <Route path="player-summary" element={<PlayerSummary />} />
        <Route path="assignments" element={<CoachAssignment />} />
        <Route path="analysis" element={<Analysis />} />
      </Route>
      
      {/* Coach routes */}
      <Route path="/coach" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/coach/rate" replace />} />
        <Route path="rate" element={<RatePlayers />} />
        <Route path="results" element={<Results />} />
        <Route path="analysis" element={<CoachAnalysis />} />
      </Route>
      
      {/* Default redirect */}
      <Route path="/" element={<DefaultRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function DefaultRedirect() {
  const user = getStoredUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.isLead) return <Navigate to="/lead/players" replace />;
  return <Navigate to="/coach/rate" replace />;
}

function SignupRedirect() {
  const location = useLocation();
  return <Navigate to={`/login${location.search}`} replace />;
}
