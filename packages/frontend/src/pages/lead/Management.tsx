import React, { useState, useEffect } from 'react';
import { team } from '../../api';

export default function Management() {
  const [coachResultsVisible, setCoachResultsVisible] = useState(true);
  const [coachAnalysisVisible, setCoachAnalysisVisible] = useState(true);
  const [exclusionMode, setExclusionMode] = useState<'include_all' | 'exclude_flagged'>('exclude_flagged');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsData, modeData] = await Promise.all([
        team.getSettings(),
        team.getExclusionMode(),
      ]);
      setCoachResultsVisible(settingsData.coachResultsVisible);
      setCoachAnalysisVisible(settingsData.coachAnalysisVisible);
      setExclusionMode(modeData.exclusionMode || 'exclude_flagged');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleResults = async () => {
    const newValue = !coachResultsVisible;
    setCoachResultsVisible(newValue);
    setSaving(true);
    try {
      await team.saveSettings({ coachResultsVisible: newValue });
    } catch (err: any) {
      setCoachResultsVisible(!newValue);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAnalysis = async () => {
    const newValue = !coachAnalysisVisible;
    setCoachAnalysisVisible(newValue);
    setSaving(true);
    try {
      await team.saveSettings({ coachAnalysisVisible: newValue });
    } catch (err: any) {
      setCoachAnalysisVisible(!newValue);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleExclusionMode = async () => {
    const newMode = exclusionMode === 'exclude_flagged' ? 'include_all' : 'exclude_flagged';
    setExclusionMode(newMode);
    setSaving(true);
    try {
      await team.saveExclusionMode(newMode);
    } catch (err: any) {
      setExclusionMode(exclusionMode);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-8">Loading settings...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Team Management</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Coach Visibility Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Coach Visibility</h3>
        <p className="text-sm text-gray-600 mb-4">
          Control which pages coaches can see. When disabled, coaches will see a message indicating the page is not available.
        </p>

        <div className="space-y-4">
          <ToggleRow
            label="Results page visible to coaches"
            description="Allow coaches to view the player rankings page"
            enabled={coachResultsVisible}
            onToggle={handleToggleResults}
            disabled={saving}
          />
          <ToggleRow
            label="Analysis page visible to coaches"
            description="Allow coaches to view the analysis page with box plots and coach metrics"
            enabled={coachAnalysisVisible}
            onToggle={handleToggleAnalysis}
            disabled={saving}
          />
        </div>
      </div>

      {/* Exclusion Settings Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold mb-4">Exclusion Settings</h3>
        <p className="text-sm text-gray-600 mb-4">
          Control how flagged coaches and ratings are handled in the analysis.
        </p>

        <ToggleRow
          label="Apply exclusions"
          description={
            exclusionMode === 'exclude_flagged'
              ? 'Flagged coaches and ratings are currently excluded from analysis'
              : 'All coaches and ratings are currently included in analysis (exclusions ignored)'
          }
          enabled={exclusionMode === 'exclude_flagged'}
          onToggle={handleToggleExclusionMode}
          disabled={saving}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  disabled,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          enabled ? 'bg-blue-600' : 'bg-gray-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
