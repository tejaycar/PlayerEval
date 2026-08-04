import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, setToken, setStoredUser } from '../api';

export default function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [inviteCode, setInviteCode] = useState(searchParams.get('invite') || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mustChangePin, setMustChangePin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await auth.login(email, pin, inviteCode);
      if (result.mustChangePin) {
        setToken(result.token);
        setMustChangePin(true);
      } else {
        setToken(result.token);
        setStoredUser(result.coach);
        if (result.coach.isLead) {
          navigate('/lead/players', { replace: true });
        } else {
          navigate('/coach/rate', { replace: true });
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPin !== confirmPin) {
      setError('PINs do not match');
      return;
    }
    if (!newPin) {
      setError('Please enter a new PIN');
      return;
    }
    setLoading(true);
    try {
      const result = await auth.changePin(pin, newPin);
      setToken(result.token);
      setStoredUser(result.coach);
      if (result.coach.isLead) {
        navigate('/lead/players', { replace: true });
      } else {
        navigate('/coach/rate', { replace: true });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (mustChangePin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <h2 className="text-2xl font-bold mb-2 text-center">Change PIN</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Your PIN is temporary. Please choose a new PIN to continue.
          </p>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleChangePin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New PIN</label>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter new PIN"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New PIN</label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Confirm new PIN"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 font-medium disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update PIN'}
            </button>
          </form>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter PIN"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invite Code</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Invite code (from your team lead)"
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
        <p className="mt-4 text-center text-sm text-gray-500">
          New team? <a href="/setup" className="text-blue-600 hover:underline">Create a team</a>
        </p>
      </div>
    </div>
  );
}
