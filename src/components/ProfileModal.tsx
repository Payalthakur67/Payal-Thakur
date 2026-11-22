import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useNotevox } from '../context/NotevoxContext';
import { BLUEPRINT_LIMITS } from '../types';

interface ProfileModalProps {
  onClose: () => void;
}

export function ProfileModal({ onClose }: ProfileModalProps) {
  const { profile, user, updateProfile } = useNotevox();
  const [displayName, setDisplayName] = useState(
    profile?.displayName || user?.displayName || 'Student'
  );
  const [majorOrGrade, setMajorOrGrade] = useState(profile?.majorOrGrade || '');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(
    String(profile?.dailyGoalMinutes ?? 60)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter your display name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        majorOrGrade: majorOrGrade.trim(),
        dailyGoalMinutes: Number(dailyGoalMinutes) || 60,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1C1926]/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="bg-white border border-[#E8E0D0] rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 id="profile-modal-title" className="text-xl font-bold text-[#1C1926]">
              Study Profile
            </h2>
            <p className="text-xs text-[#5C566C] mt-0.5">
              Personalize your Notevox greeting and daily study target.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#5C566C] hover:bg-[#F3EEE2] hover:text-[#1C1926]"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-semibold text-[#1C1926] mb-1.5">
              Name
            </label>
            <input
              id="profile-name"
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.DISPLAY_NAME_MAX}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm text-[#1C1926] focus:border-[#1C1926] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="profile-major" className="block text-xs font-semibold text-[#1C1926] mb-1.5">
              Major, Program, or Grade (optional)
            </label>
            <input
              id="profile-major"
              type="text"
              maxLength={BLUEPRINT_LIMITS.MAJOR_MAX}
              value={majorOrGrade}
              onChange={(e) => setMajorOrGrade(e.target.value)}
              placeholder="e.g., Computer Science · Year 2"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm text-[#1C1926] focus:border-[#1C1926] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="profile-goal" className="block text-xs font-semibold text-[#1C1926] mb-1.5">
              Daily Study Goal (minutes)
            </label>
            <input
              id="profile-goal"
              type="number"
              min={BLUEPRINT_LIMITS.DAILY_GOAL_MIN}
              max={BLUEPRINT_LIMITS.DAILY_GOAL_MAX}
              value={dailyGoalMinutes}
              onChange={(e) => setDailyGoalMinutes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm font-mono tabular-nums text-[#1C1926] focus:border-[#1C1926] focus:outline-none"
            />
            <p className="text-xs text-[#7B748C] mt-1">
              Used to calculate your daily progress bar on the dashboard.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-[#FDF2F7] text-xs text-[#8E2050] border border-[#F2C6D8]">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#E5DCCB] text-sm font-medium text-[#5C566C] hover:bg-[#F7F2E7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-sm font-semibold hover:bg-[#312C42] disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
