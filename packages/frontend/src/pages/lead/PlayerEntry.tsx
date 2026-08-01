import React, { useState, useEffect, useRef } from 'react';
import { players } from '../../api';

interface Player {
  id: string;
  name: string;
  number: string;
  primaryPosition: string;
  secondaryPosition: string;
  requiredEvaluations: number;
}

interface EditableRow {
  name: string;
  number: string;
  primaryPosition: string;
  secondaryPosition: string;
  requiredEvaluations: string;
}

const emptyRow: EditableRow = {
  name: '',
  number: '',
  primaryPosition: '',
  secondaryPosition: '',
  requiredEvaluations: '3',
};

export default function PlayerEntry() {
  const [playerList, setPlayerList] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditableRow>(emptyRow);
  const [newRow, setNewRow] = useState<EditableRow>({ ...emptyRow });
  const newRowRef = useRef<HTMLTableRowElement>(null);

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

    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const csv = 'name,number,primary_position,secondary_position,required_evaluations\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'players_template.csv';
    a.click();
    URL.revokeObjectURL(url);
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

  const startEditing = (player: Player) => {
    setEditingId(player.id);
    setEditValues({
      name: player.name,
      number: player.number,
      primaryPosition: player.primaryPosition,
      secondaryPosition: player.secondaryPosition,
      requiredEvaluations: String(player.requiredEvaluations),
    });
  };

  const saveEdit = async (id: string) => {
    if (!editValues.name.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await players.update(id, {
        name: editValues.name.trim(),
        number: editValues.number.trim(),
        primaryPosition: editValues.primaryPosition.trim(),
        secondaryPosition: editValues.secondaryPosition.trim(),
        requiredEvaluations: editValues.requiredEvaluations,
      });
      setEditingId(null);
      await loadPlayers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const handleNewRowSave = async () => {
    if (!newRow.name.trim()) return;
    try {
      await players.create({
        name: newRow.name.trim(),
        number: newRow.number.trim(),
        primaryPosition: newRow.primaryPosition.trim(),
        secondaryPosition: newRow.secondaryPosition.trim(),
        requiredEvaluations: newRow.requiredEvaluations || '3',
      });
      setNewRow({ ...emptyRow });
      await loadPlayers();
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleNewRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNewRowSave();
    }
  };

  const handleNewRowBlur = (e: React.FocusEvent) => {
    // Only save if focus is leaving the new row entirely
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (newRowRef.current && relatedTarget && newRowRef.current.contains(relatedTarget)) {
      return;
    }
    if (newRow.name.trim()) {
      handleNewRowSave();
    }
  };

  if (loading) return <div className="text-center py-8">Loading players...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Players</h2>
        <div className="flex gap-3">
          <button
            onClick={handleDownloadTemplate}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm font-medium"
          >
            Download Template
          </button>
          <label className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer text-sm font-medium">
            Upload CSV
            <input type="file" accept=".csv" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
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
              <tr
                key={player.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => { if (editingId !== player.id) startEditing(player); }}
              >
                {editingId === player.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editValues.number}
                        onChange={(e) => setEditValues({ ...editValues, number: e.target.value })}
                        onKeyDown={(e) => handleEditKeyDown(e, player.id)}
                        onBlur={() => saveEdit(player.id)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editValues.name}
                        onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                        onKeyDown={(e) => handleEditKeyDown(e, player.id)}
                        onBlur={() => saveEdit(player.id)}
                        className="w-full px-2 py-1 border rounded text-sm"
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editValues.primaryPosition}
                        onChange={(e) => setEditValues({ ...editValues, primaryPosition: e.target.value })}
                        onKeyDown={(e) => handleEditKeyDown(e, player.id)}
                        onBlur={() => saveEdit(player.id)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editValues.secondaryPosition}
                        onChange={(e) => setEditValues({ ...editValues, secondaryPosition: e.target.value })}
                        onKeyDown={(e) => handleEditKeyDown(e, player.id)}
                        onBlur={() => saveEdit(player.id)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="1"
                        value={editValues.requiredEvaluations}
                        onChange={(e) => setEditValues({ ...editValues, requiredEvaluations: e.target.value })}
                        onKeyDown={(e) => handleEditKeyDown(e, player.id)}
                        onBlur={() => saveEdit(player.id)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(player.id); }}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-sm">{player.number}</td>
                    <td className="px-4 py-3 text-sm font-medium">{player.name}</td>
                    <td className="px-4 py-3 text-sm">{player.primaryPosition}</td>
                    <td className="px-4 py-3 text-sm">{player.secondaryPosition}</td>
                    <td className="px-4 py-3 text-sm">{player.requiredEvaluations}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(player.id); }}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {/* New row for adding a player */}
            <tr ref={newRowRef} className="bg-gray-50/50">
              <td className="px-4 py-2">
                <input
                  type="text"
                  value={newRow.number}
                  onChange={(e) => setNewRow({ ...newRow, number: e.target.value })}
                  onKeyDown={handleNewRowKeyDown}
                  onBlur={handleNewRowBlur}
                  placeholder="#"
                  className="w-full px-2 py-1 border border-dashed border-gray-300 rounded text-sm bg-white placeholder-gray-400"
                />
              </td>
              <td className="px-4 py-2">
                <input
                  type="text"
                  value={newRow.name}
                  onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
                  onKeyDown={handleNewRowKeyDown}
                  onBlur={handleNewRowBlur}
                  placeholder="New player name..."
                  className="w-full px-2 py-1 border border-dashed border-gray-300 rounded text-sm bg-white placeholder-gray-400"
                />
              </td>
              <td className="px-4 py-2">
                <input
                  type="text"
                  value={newRow.primaryPosition}
                  onChange={(e) => setNewRow({ ...newRow, primaryPosition: e.target.value })}
                  onKeyDown={handleNewRowKeyDown}
                  onBlur={handleNewRowBlur}
                  placeholder="Position"
                  className="w-full px-2 py-1 border border-dashed border-gray-300 rounded text-sm bg-white placeholder-gray-400"
                />
              </td>
              <td className="px-4 py-2">
                <input
                  type="text"
                  value={newRow.secondaryPosition}
                  onChange={(e) => setNewRow({ ...newRow, secondaryPosition: e.target.value })}
                  onKeyDown={handleNewRowKeyDown}
                  onBlur={handleNewRowBlur}
                  placeholder="Position"
                  className="w-full px-2 py-1 border border-dashed border-gray-300 rounded text-sm bg-white placeholder-gray-400"
                />
              </td>
              <td className="px-4 py-2">
                <input
                  type="number"
                  min="1"
                  value={newRow.requiredEvaluations}
                  onChange={(e) => setNewRow({ ...newRow, requiredEvaluations: e.target.value })}
                  onKeyDown={handleNewRowKeyDown}
                  onBlur={handleNewRowBlur}
                  placeholder="3"
                  className="w-full px-2 py-1 border border-dashed border-gray-300 rounded text-sm bg-white placeholder-gray-400"
                />
              </td>
              <td className="px-4 py-2 text-xs text-gray-400">
                Type to add
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        CSV format: name, number, primary_position, secondary_position, required_evaluations
      </p>
    </div>
  );
}
