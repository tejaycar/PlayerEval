import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, setToken, setStoredUser } from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [teamId, setTeamId] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await auth.requestLink(email, teamId);
      // In bypass mode, the API returns the token directly - auto-verify
      if (result.token) {
        const verifyResult = await auth.verify(result.token);
        setToken(verifyResult.token);
        setStoredUser(verifyResult.coach);
        if (verifyResult.coach.isLead) {
          navigate('/lead/players', { replace: true });
        } else {
          navigate('/coach/rate', { replace: true });
        }
      } else {
        setSent(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-4">Check your email!</h2>
          <p className="text-gray-600">
            We sent a login link to <strong>{email}</strong>. Click the link to sign in.
          </p>
          <p className="text-sm text-gray-400 mt-4">Link expires in 15 minutes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6 text-center">PlayerEval Login</h2>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="coach@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team ID</label>
            <input
              type="text"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Your team ID"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="mt-4 text-center space-y-2">
          <p className="text-sm text-gray-500">
            Have an invite link? <a href="/signup" className="text-blue-600 hover:underline">Sign up here</a>
          </p>
          <p className="text-sm text-gray-500">
            New team? <a href="/setup" className="text-blue-600 hover:underline">Create a team</a>
          </p>
        </div>
      </div>
    </div>
  );
}
