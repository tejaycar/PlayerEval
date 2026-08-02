import React, { useState, useEffect } from 'react';
import { assignments, players as playersApi, coaches as coachesApi } from '../../api';

interface Player {
  id: string;
  name: string;
  number: string;
  requiredEvaluations: number;
}

interface Coach {
  id: string;
  name: string;
  maxPlayers: number;
}

interface AssignmentData {
  coachId: string;
  playerId: string;
}

export default function CoachAssignment() {
  const [playerList, setPlayerList] = useState<Player[]>([]);
  const [coachList, setCoachList] = useState<Coach[]>([]);
  const [assignmentList, setAssignmentList] = useState<AssignmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [pData, cData, aData] = await Promise.all([
        playersApi.list(),
        coachesApi.list(),
        assignments.list(),
      ]);
      setPlayerList(pData.players);
      setCoachList(cData.coaches);
      setAssignmentList(aData.assignments);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoAssign = async () => {
    try {
      const data = await assignments.autoAssign();
      setAssignmentList(data.assignments);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleClearAssignments = async () => {
    if (!confirm('Clear all assignments? This cannot be undone.')) return;
    try {
      await assignments.clearAll();
      setAssignmentList([]);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const isAssigned = (coachId: string, playerId: string) => {
    return assignmentList.some((a) => a.coachId === coachId && a.playerId === playerId);
  };

  const toggleAssignment = async (coachId: string, playerId: string) => {
    try {
      if (isAssigned(coachId, playerId)) {
        await assignments.remove(coachId, playerId);
        setAssignmentList((prev) =>
          prev.filter((a) => !(a.coachId === coachId && a.playerId === playerId))
        );
      } else {
        await assignments.add(coachId, playerId);
        setAssignmentList((prev) => [...prev, { coachId, playerId }]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getCoachCount = (coachId: string) => {
    return assignmentList.filter((a) => a.coachId === coachId).length;
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Coach Assignments</h2>
        <div className="flex gap-3">
          <button
            onClick={handleClearAssignments}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
          >
            Clear Assignments
          </button>
          <button
            onClick={handleAutoAssign}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            Auto-Assign
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {(() => {
        const totalEvalSlots = coachList.reduce((sum, c) => sum + c.maxPlayers, 0);
        const totalRequiredEvals = playerList.reduce((sum, p) => sum + (p.requiredEvaluations || 0), 0);
        if (totalEvalSlots < totalRequiredEvals && playerList.length > 0 && coachList.length > 0) {
          return (
            <div className="bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium">
                Coaches can perform {totalEvalSlots} evaluations but {totalRequiredEvals} are required to meet all player minimums.
              </span>
            </div>
          );
        }
        return null;
      })()}

      {playerList.length === 0 || coachList.length === 0 ? (
        <p className="text-gray-500">Add players and coaches first.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="bg-white rounded-lg shadow-sm border text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500 sticky left-0 bg-gray-50">
                  Player
                </th>
                {coachList.map((coach) => (
                  <th key={coach.id} className="px-3 py-2 text-center font-medium text-gray-500">
                    <div>{coach.name}</div>
                    <div className="text-gray-400 font-normal">
                      {getCoachCount(coach.id)}/{coach.maxPlayers}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {playerList.map((player) => (
                <tr key={player.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium sticky left-0 bg-white">
                    #{player.number} {player.name}
                  </td>
                  {coachList.map((coach) => (
                    <td key={coach.id} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isAssigned(coach.id, player.id)}
                        onChange={() => toggleAssignment(coach.id, player.id)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
