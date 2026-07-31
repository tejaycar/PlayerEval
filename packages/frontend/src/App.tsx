import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getToken, getStoredUser } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AuthVerify from './pages/AuthVerify';
import PlayerEntry from './pages/lead/PlayerEntry';
import CoachEntry from './pages/lead/CoachEntry';
import PlayerSummary from './pages/lead/PlayerSummary';
import CoachAssignment from './pages/lead/CoachAssignment';
import RatePlayers from './pages/coach/RatePlayers';
import Results from './pages/coach/Results';

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
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth/verify" element={<AuthVerify />} />
      
      {/* Lead routes */}
      <Route path="/lead" element={<ProtectedRoute requireLead><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/lead/players" replace />} />
        <Route path="players" element={<PlayerEntry />} />
        <Route path="coaches" element={<CoachEntry />} />
        <Route path="player-summary/:playerId" element={<PlayerSummary />} />
        <Route path="player-summary" element={<PlayerSummary />} />
        <Route path="assignments" element={<CoachAssignment />} />
      </Route>
      
      {/* Coach routes */}
      <Route path="/coach" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/coach/rate" replace />} />
        <Route path="rate" element={<RatePlayers />} />
        <Route path="results" element={<Results />} />
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
