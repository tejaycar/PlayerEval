import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, setStoredUser } from '../api';

// Setup endpoint creates a team + lead coach in one step
async function setupTeam(data: { teamName: string; leadName: string; leadEmail: string; leadPin: string }) {
  const res = await fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Setup failed');
  return json;
}

export default function Setup() {
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState('');
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPin, setLeadPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (leadPin !== confirmPin) {
        setError('PINs do not match');
        setLoading(false);
        return;
      }
      if (!leadPin) {
        setError('Please choose a PIN');
        setLoading(false);
        return;
      }
      const result = await setupTeam({ teamName, leadName, leadEmail, leadPin });
      // result contains { token, coach, teamId, inviteCode }
      setToken(result.token);
      setStoredUser(result.coach);
      if (result.teamId) {
        localStorage.setItem('playereval_teamId', result.teamId);
      }
      navigate('/lead/players', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h2 className="text-2xl font-bold mb-2 text-center">Create Your Team</h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          Set up a new team for player evaluations
        </p>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. Wildcats U12"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
            <input
              type="text"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Your full name"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Email</label>
            <input
              type="email"
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Choose a PIN</label>
            <input
              type="password"
              value={leadPin}
              onChange={(e) => setLeadPin(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Choose a PIN"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm PIN</label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Confirm PIN"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Team'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          Already have a team? <a href="/login" className="text-blue-600 hover:underline">Login here</a>
        </p>
      </div>
    </div>
  );
}
