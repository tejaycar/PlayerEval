import React, { useState, useEffect } from 'react';
import { assignments, players as playersApi, coaches as coachesApi } from '../../api';

interface Player {
  id: string;
  name: string;
  number: string;
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
        <button
          onClick={handleAutoAssign}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
        >
          Auto-Assign
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

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
