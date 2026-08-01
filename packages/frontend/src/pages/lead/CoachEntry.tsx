import React, { useState, useEffect, useRef } from 'react';
import { coaches } from '../../api';

interface Coach {
  id: string;
  name: string;
  email: string;
  maxPlayers: number;
  isLead: boolean;
}

interface EditableRow {
  name: string;
  email: string;
  maxPlayers: string;
}

const emptyRow: EditableRow = {
  name: '',
  email: '',
  maxPlayers: '10',
};

export default function CoachEntry() {
  const [coachList, setCoachList] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditableRow>(emptyRow);
  const [newRow, setNewRow] = useState<EditableRow>({ ...emptyRow });
  const newRowRef = useRef<HTMLTableRowElement>(null);
  const editRowRef = useRef<HTMLTableRowElement>(null);

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

  const handleDownloadTemplate = () => {
    const csv = 'name,email,max_players\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coaches_template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this coach?')) return;
    try {
      await coaches.delete(id);
      await loadCoaches();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEditing = (coach: Coach) => {
    setEditingId(coach.id);
    setEditValues({
      name: coach.name,
      email: coach.email,
      maxPlayers: String(coach.maxPlayers),
    });
  };

  const saveEdit = async (id: string) => {
    if (!editValues.name.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await coaches.update(id, {
        name: editValues.name.trim(),
        email: editValues.email.trim(),
        maxPlayers: editValues.maxPlayers,
      });
      setEditingId(null);
      await loadCoaches();
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

  const handleEditBlur = (e: React.FocusEvent, id: string) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (editRowRef.current && relatedTarget && editRowRef.current.contains(relatedTarget)) {
      return;
    }
    saveEdit(id);
  };

  const handleNewRowSave = async () => {
    if (!newRow.name.trim()) return;
    try {
      await coaches.create({
        name: newRow.name.trim(),
        email: newRow.email.trim(),
        maxPlayers: newRow.maxPlayers || '10',
      });
      setNewRow({ ...emptyRow });
      await loadCoaches();
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
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (newRowRef.current && relatedTarget && newRowRef.current.contains(relatedTarget)) {
      return;
    }
    if (newRow.name.trim()) {
      handleNewRowSave();
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
              <tr
                key={coach.id}
                ref={editingId === coach.id ? editRowRef : undefined}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => { if (editingId !== coach.id) startEditing(coach); }}
              >
                {editingId === coach.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editValues.name}
                        onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                        onKeyDown={(e) => handleEditKeyDown(e, coach.id)}
                        onBlur={(e) => handleEditBlur(e, coach.id)}
                        className="w-full px-2 py-1 border rounded text-sm"
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="email"
                        value={editValues.email}
                        onChange={(e) => setEditValues({ ...editValues, email: e.target.value })}
                        onKeyDown={(e) => handleEditKeyDown(e, coach.id)}
                        onBlur={(e) => handleEditBlur(e, coach.id)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="1"
                        value={editValues.maxPlayers}
                        onChange={(e) => setEditValues({ ...editValues, maxPlayers: e.target.value })}
                        onKeyDown={(e) => handleEditKeyDown(e, coach.id)}
                        onBlur={(e) => handleEditBlur(e, coach.id)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {coach.isLead && (
                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs">Lead</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(coach.id); }}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </>
                ) : (
                  <>
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
                        onClick={(e) => { e.stopPropagation(); handleDelete(coach.id); }}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {/* New row for adding a coach */}
            <tr ref={newRowRef} className="bg-gray-50/50">
              <td className="px-4 py-2">
                <input
                  type="text"
                  value={newRow.name}
                  onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
                  onKeyDown={handleNewRowKeyDown}
                  onBlur={handleNewRowBlur}
                  placeholder="New coach name..."
                  className="w-full px-2 py-1 border border-dashed border-gray-300 rounded text-sm bg-white placeholder-gray-400"
                />
              </td>
              <td className="px-4 py-2">
                <input
                  type="email"
                  value={newRow.email}
                  onChange={(e) => setNewRow({ ...newRow, email: e.target.value })}
                  onKeyDown={handleNewRowKeyDown}
                  onBlur={handleNewRowBlur}
                  placeholder="email@example.com"
                  className="w-full px-2 py-1 border border-dashed border-gray-300 rounded text-sm bg-white placeholder-gray-400"
                />
              </td>
              <td className="px-4 py-2">
                <input
                  type="number"
                  min="1"
                  value={newRow.maxPlayers}
                  onChange={(e) => setNewRow({ ...newRow, maxPlayers: e.target.value })}
                  onKeyDown={handleNewRowKeyDown}
                  onBlur={handleNewRowBlur}
                  placeholder="10"
                  className="w-full px-2 py-1 border border-dashed border-gray-300 rounded text-sm bg-white placeholder-gray-400"
                />
              </td>
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2 text-xs text-gray-400">
                Type to add
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        CSV format: name, email, max_players
      </p>
    </div>
  );
}
