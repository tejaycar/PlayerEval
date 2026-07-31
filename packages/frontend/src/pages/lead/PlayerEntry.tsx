import React, { useState, useEffect } from 'react';
import { players } from '../../api';

interface Player {
  id: string;
  name: string;
  number: string;
  primaryPosition: string;
  secondaryPosition: string;
  requiredEvaluations: number;
}

export default function PlayerEntry() {
  const [playerList, setPlayerList] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlayer, setNewPlayer] = useState({
    name: '',
    number: '',
    primaryPosition: '',
    secondaryPosition: '',
    requiredEvaluations: '3',
  });

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      const data = await players.list();
      setPlayerList(data.players);
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

    // Validate headers
    const requiredHeaders = ['name', 'number', 'primary_position', 'secondary_position'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      setError(
        `CSV is missing required headers: ${missingHeaders.join(', ')}. ` +
        `Expected headers: name, number, primary_position, secondary_position, required_evaluations. ` +
        `Found headers: ${headers.join(', ')}`
      );
      return;
    }

    try {
      await players.upload(rows);
      await loadPlayers();
      setError('');
    } catch (err: any) {
      setError(err.message);
    }

    // Reset file input
    e.target.value = '';
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await players.create(newPlayer);
      setNewPlayer({ name: '', number: '', primaryPosition: '', secondaryPosition: '', requiredEvaluations: '3' });
      setShowAddForm(false);
      await loadPlayers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this player?')) return;
    try {
      await players.delete(id);
      await loadPlayers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <div className="text-center py-8">Loading players...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Players</h2>
        <div className="flex gap-3">
          <label className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer text-sm font-medium">
            Upload CSV
            <input type="file" accept=".csv" onChange={handleUpload} className="hidden" />
          </label>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            + Add Player
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddPlayer} className="bg-gray-50 p-4 rounded-lg mb-6 grid grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={newPlayer.name}
              onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Number</label>
            <input
              type="text"
              value={newPlayer.number}
              onChange={(e) => setNewPlayer({ ...newPlayer, number: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Primary Pos</label>
            <input
              type="text"
              value={newPlayer.primaryPosition}
              onChange={(e) => setNewPlayer({ ...newPlayer, primaryPosition: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Secondary Pos</label>
            <input
              type="text"
              value={newPlayer.secondaryPosition}
              onChange={(e) => setNewPlayer({ ...newPlayer, secondaryPosition: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1"># Evals</label>
            <input
              type="number"
              min="1"
              value={newPlayer.requiredEvaluations}
              onChange={(e) => setNewPlayer({ ...newPlayer, requiredEvaluations: e.target.value })}
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Primary Pos</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Secondary Pos</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Req. Evals</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {playerList.map((player) => (
              <tr key={player.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{player.number}</td>
                <td className="px-4 py-3 text-sm font-medium">{player.name}</td>
                <td className="px-4 py-3 text-sm">{player.primaryPosition}</td>
                <td className="px-4 py-3 text-sm">{player.secondaryPosition}</td>
                <td className="px-4 py-3 text-sm">{player.requiredEvaluations}</td>
                <td className="px-4 py-3 text-sm">
                  <button
                    onClick={() => handleDelete(player.id)}
                    className="text-red-600 hover:text-red-800 text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {playerList.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No players yet. Upload a CSV or add players manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        CSV format: name, number, primary_position, secondary_position, required_evaluations
      </p>
    </div>
  );
}
