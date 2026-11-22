import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  Clock,
  Plus,
  Trash2,
} from 'lucide-react';
import { useNotevox } from '../context/NotevoxContext';
import { NOTEVOX_ASSETS } from '../lib/assets';
import { formatDueDate, SUBJECT_PALETTE } from '../lib/palette';
import { BLUEPRINT_LIMITS, type TaskPriority } from '../types';
import { IllustrationFrame } from './IllustrationFrame';

interface TasksViewProps {
  searchQuery: string;
}

type TaskFilter = 'all' | 'upcoming' | 'reminders' | 'completed';

export function TasksView({ searchQuery }: TasksViewProps) {
  const {
    tasks,
    subjects,
    createTask,
    toggleTaskCompleted,
    toggleTaskReminder,
    deleteTask,
  } = useNotevox();

  const [filter, setFilter] = useState<TaskFilter>('upcoming');
  const [subjectFilter, setSubjectFilter] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter === 'upcoming' && task.completed) return false;
      if (filter === 'completed' && !task.completed) return false;
      if (filter === 'reminders' && (!task.reminderEnabled || task.completed)) return false;
      if (subjectFilter && task.subjectId !== subjectFilter) return false;
      if (q) {
        const hay = `${task.title} ${task.details}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filter, subjectFilter, searchQuery]);

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await createTask({
        title: title.trim(),
        details: details.trim(),
        subjectId,
        dueDate,
        priority,
        reminderEnabled,
      });
      setTitle('');
      setDetails('');
      setDueDate('');
      setPriority('medium');
      setReminderEnabled(true);
    } finally {
      setSubmitting(false);
    }
  }

  const pendingCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 4 cols: Add New Study Task / Reminder */}
      <div className="lg:col-span-4 nv-studio-card rounded-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-[#83D66F]" aria-hidden="true" />
        <div className="p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-[#1C1926]">Add Study Task</h2>
          <p className="text-xs text-[#5C566C] mt-0.5">
            Track assignments, exam prep milestones, and reading reminders.
          </p>
        </div>

        <form onSubmit={handleCreateTask} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
              Task Title
            </label>
            <input
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.TASK_TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Review Chapter 5 flashcards"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
              Notes or Details (optional)
            </label>
            <textarea
              rows={2}
              maxLength={BLUEPRINT_LIMITS.TASK_DETAILS_MAX}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Pages, lab partner, or rubric details..."
              className="w-full p-3 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                Subject
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
              >
                <option value="">General</option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                Due Date & Time (optional)
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-[#1C1926] mb-1.5">Priority</span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'low', label: 'Low' },
                  { id: 'medium', label: 'Medium' },
                  { id: 'high', label: 'High' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPriority(opt.id)}
                  className={`py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    priority === opt.id
                      ? 'bg-[#FFF9E5] border-[#1C1926] text-[#1C1926]'
                      : 'bg-[#FFFDF8] border-[#E8E0D0] text-[#5C566C] hover:border-[#C9C1B0]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs font-medium text-[#1C1926] cursor-pointer">
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
              className="w-4 h-4 accent-[#1C1926]"
            />
            <span>Flag as active study reminder</span>
          </label>

          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="w-full py-3 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold hover:bg-[#312C42] disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#83D66F]" />
            {submitting ? 'Adding Task...' : 'Add Study Task'}
          </button>
        </form>
        </div>
      </div>

      {/* Right 8 cols: Task Queue & Filters */}
      <div className="lg:col-span-8 nv-studio-card rounded-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-[#62B8F5]" aria-hidden="true" />
        <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#F0E9DC]">
          <div className="inline-flex items-center p-1 rounded-xl bg-[#F3EEE2] border border-[#E8E0D0]">
            {(
              [
                { id: 'upcoming', label: `Upcoming (${pendingCount})` },
                { id: 'reminders', label: 'Reminders' },
                { id: 'completed', label: `Completed (${completedCount})` },
                { id: 'all', label: 'All' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  filter === tab.id
                    ? 'bg-white text-[#1C1926] shadow-xs'
                    : 'text-[#5C566C] hover:text-[#1C1926]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter tasks by subject"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-xs font-medium text-[#1C1926]"
          >
            <option value="">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="py-6 grid grid-cols-1 sm:grid-cols-12 gap-6 items-center max-w-2xl mx-auto">
            <div className="sm:col-span-5">
              <IllustrationFrame
                src={NOTEVOX_ASSETS.tasksPlanner}
                alt="Neat student planner waiting for tasks and deadlines"
                fallbackType="tasks"
                className="aspect-[4/3] w-full"
              />
            </div>
            <div className="sm:col-span-7 space-y-2">
              <h3 className="text-lg font-bold text-[#1C1926]">
                {tasks.length === 0
                  ? 'Your study planner is clear'
                  : 'No tasks match this filter'}
              </h3>
              <p className="text-sm text-[#5C566C] leading-relaxed">
                {tasks.length === 0
                  ? 'Add your first study task or exam reminder on the left. Completed tasks automatically count toward your real dashboard progress.'
                  : 'Switch filter tabs or add a new task to populate this view.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#F0E9DC]">
            {filteredTasks.map((task) => {
              const due = formatDueDate(task.dueDate);
              const subj = task.subjectId ? subjectMap.get(task.subjectId) : undefined;
              const subjPalette = subj ? SUBJECT_PALETTE[subj.color] : null;

              return (
                <div
                  key={task.id}
                  className="py-4 first:pt-1 last:pb-1 flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => void toggleTaskCompleted(task)}
                      aria-label={
                        task.completed
                          ? `Mark "${task.title}" incomplete`
                          : `Mark "${task.title}" complete`
                      }
                      className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        task.completed
                          ? 'bg-[#83D66F] border-[#5BB347] text-[#1C1926]'
                          : 'border-[#C9C1B0] hover:border-[#1C1926] bg-white'
                      }`}
                    >
                      {task.completed && <Check className="w-3.5 h-3.5" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-semibold leading-snug ${
                          task.completed ? 'line-through text-[#7B748C]' : 'text-[#1C1926]'
                        }`}
                      >
                        {task.title}
                      </div>

                      {task.details && (
                        <p className="text-xs text-[#5C566C] mt-1 leading-relaxed">
                          {task.details}
                        </p>
                      )}

                      {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5C566C] mt-1.5">
                        {subj && subjPalette && (
                          <>
                            <span
                              className={`inline-block w-2 h-2 rounded-sm ${subjPalette.swatchClass}`}
                              aria-hidden="true"
                            />
                            <span className="font-medium text-[#1C1926]">{subj.name}</span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}

                        <span
                          className={`inline-flex items-center gap-1 ${
                            due.isOverdue && !task.completed
                              ? 'text-[#A62448] font-semibold'
                              : ''
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {due.label}
                        </span>

                        <span aria-hidden="true">·</span>

                        <span
                          className={`inline-flex items-center gap-1 ${
                            task.priority === 'high'
                              ? 'text-[#A62448] font-semibold'
                              : task.priority === 'medium'
                                ? 'text-[#7A5200]'
                                : 'text-[#5C566C]'
                          }`}
                        >
                          {task.priority === 'high' && <AlertTriangle className="w-3 h-3" />}
                          {task.priority === 'high'
                            ? 'High priority'
                            : task.priority === 'medium'
                              ? 'Medium priority'
                              : 'Low priority'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void toggleTaskReminder(task)}
                      title={task.reminderEnabled ? 'Mute reminder' : 'Enable reminder'}
                      aria-label={task.reminderEnabled ? 'Mute reminder' : 'Enable reminder'}
                      className={`p-2 rounded-lg transition-colors cursor-pointer ${
                        task.reminderEnabled
                          ? 'bg-[#FFF9E5] text-[#7A5200]'
                          : 'text-[#8E879E] hover:bg-[#F3EEE2]'
                      }`}
                    >
                      {task.reminderEnabled ? (
                        <Bell className="w-4 h-4" />
                      ) : (
                        <BellOff className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTask(task.id)}
                      aria-label={`Delete "${task.title}"`}
                      className="p-2 rounded-lg text-[#7B748C] hover:text-[#A62448] hover:bg-[#FDF2F7] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
