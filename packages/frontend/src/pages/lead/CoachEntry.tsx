import React, { useState, useEffect } from 'react';
import { coaches } from '../../api';

interface Coach {
  id: string;
  name: string;
  email: string;
  maxPlayers: number;
  isLead: boolean;
}

export default function CoachEntry() {
  const [coachList, setCoachList] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCoach, setNewCoach] = useState({ name: '', email: '', maxPlayers: '10' });

  useEffect(() => {
    loadCoaches();
  }, []);

  const loadCoaches = async () => {
    try {
      const data = await coaches.list();
      setCoachList(data.coaches);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

    const rows = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] || '';
      });
      return row;
    });

    const requiredHeaders = ['name', 'email'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      setError(
        `CSV is missing required headers: ${missingHeaders.join(', ')}. ` +
        `Expected headers: name, email, max_players. ` +
        `Found headers: ${headers.join(', ')}`
      );
      return;
    }

    try {
      await coaches.upload(rows);
      await loadCoaches();
      setError('');
    } catch (err: any) {
      setError(err.message);
    }

    e.target.value = '';
  };

  const handleGetInviteLink = async () => {
    try {
      const data = await coaches.getInviteLink();
      setInviteLink(data.inviteLink);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
  };

  const handleAddCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await coaches.create(newCoach);
      setNewCoach({ name: '', email: '', maxPlayers: '10' });
      setShowAddForm(false);
      await loadCoaches();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this coach?')) return;
    try {
      await coaches.delete(id);
      await loadCoaches();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <div className="text-center py-8">Loading coaches...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Coaches</h2>
        <div className="flex gap-3">
          <button
            onClick={handleGetInviteLink}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm font-medium"
          >
            Get Invite Link
          </button>
          <label className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer text-sm font-medium">
            Upload CSV
            <input type="file" accept=".csv" onChange={handleUpload} className="hidden" />
          </label>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            + Add Coach
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {inviteLink && (
        <div className="bg-purple-50 border border-purple-200 px-4 py-3 rounded mb-4 flex items-center gap-3">
          <span className="text-sm text-purple-700 flex-1 font-mono break-all">{inviteLink}</span>
          <button
            onClick={handleCopyLink}
            className="px-3 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
          >
            Copy
          </button>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddCoach} className="bg-gray-50 p-4 rounded-lg mb-6 grid grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={newCoach.name}
              onChange={(e) => setNewCoach({ ...newCoach, name: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={newCoach.email}
              onChange={(e) => setNewCoach({ ...newCoach, email: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max Players</label>
            <input
              type="number"
              min="1"
              value={newCoach.maxPlayers}
              onChange={(e) => setNewCoach({ ...newCoach, maxPlayers: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
            Save
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full bg-white rounded-lg shadow-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max Players</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {coachList.map((coach) => (
              <tr key={coach.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium">{coach.name}</td>
                <td className="px-4 py-3 text-sm">{coach.email}</td>
                <td className="px-4 py-3 text-sm">{coach.maxPlayers}</td>
                <td className="px-4 py-3 text-sm">
                  {coach.isLead && (
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs">Lead</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <button
                    onClick={() => handleDelete(coach.id)}
                    className="text-red-600 hover:text-red-800 text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {coachList.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No coaches yet. Upload a CSV or add coaches manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        CSV format: name, email, max_players
      </p>
    </div>
  );
}
