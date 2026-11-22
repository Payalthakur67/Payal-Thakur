import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  FileUp,
  FolderPlus,
  Mic,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
} from 'lucide-react';
import { useNotevox } from '../context/NotevoxContext';
import { NOTEVOX_ASSETS } from '../lib/assets';
import {
  formatDueDate,
  formatDuration,
  formatTimestampDate,
  getGreetingPrefix,
  getLast7DateKeys,
  getTodayDateKey,
  SUBJECT_PALETTE,
} from '../lib/palette';
import type { NavView } from '../types';
import { IllustrationFrame } from './IllustrationFrame';

interface DashboardViewProps {
  onNavigate: (view: NavView) => void;
  onOpenNote: (noteId: string) => void;
  onOpenSubjectNotes: (subjectId: string) => void;
  onQuickUploadDoc: () => void;
  onQuickNewNote: () => void;
  onOpenProfile: () => void;
}

const FOCUS_LAP_SECONDS = 25 * 60; // 25-minute Pomodoro lap for circular dial visualization

export function DashboardView({
  onNavigate,
  onOpenNote,
  onOpenSubjectNotes,
  onQuickUploadDoc,
  onQuickNewNote,
  onOpenProfile,
}: DashboardViewProps) {
  const {
    profile,
    user,
    subjects,
    notes,
    tasks,
    activities,
    createTask,
    toggleTaskCompleted,
    logStudyActivity,
  } = useNotevox();

  // Focus Study Session Timer (logs real study time to Firestore)
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loggingSession, setLoggingSession] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Interactive 7-day SVG chart hover/selected day index
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  // Quick inline task input
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskDue, setQuickTaskDue] = useState('');
  const [addingQuickTask, setAddingQuickTask] = useState(false);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  async function handleLogFocusSession() {
    if (elapsedSeconds < 60) {
      setSessionNotice('Study for at least 1 minute to log a focus session.');
      return;
    }
    setLoggingSession(true);
    setSessionNotice(null);
    const mins = Math.max(1, Math.round(elapsedSeconds / 60));
    try {
      await logStudyActivity({
        type: 'study_session',
        label: `Focused study session (${mins} min)`,
        durationMinutes: mins,
      });
      setTimerRunning(false);
      setElapsedSeconds(0);
      setSessionNotice(`Logged ${mins} min toward today's goal.`);
    } finally {
      setLoggingSession(false);
    }
  }

  async function handleQuickAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;
    setAddingQuickTask(true);
    try {
      await createTask({
        title: quickTaskTitle.trim(),
        dueDate: quickTaskDue,
        priority: 'medium',
        reminderEnabled: Boolean(quickTaskDue),
      });
      setQuickTaskTitle('');
      setQuickTaskDue('');
    } finally {
      setAddingQuickTask(false);
    }
  }

  const displayName = profile?.displayName || user?.displayName || 'Student';
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const dailyGoal = profile?.dailyGoalMinutes ?? 60;
  const todayKey = getTodayDateKey();

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  // Honest, real-data progress metrics
  const audioNotesCount = useMemo(
    () => notes.filter((n) => n.sourceType === 'audio').length,
    [notes]
  );
  const completedTasksCount = useMemo(
    () => tasks.filter((t) => t.completed).length,
    [tasks]
  );
  const pendingTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);

  const todayMinutes = useMemo(() => {
    return activities
      .filter((a) => a.dateKey === todayKey)
      .reduce((acc, a) => acc + (a.durationMinutes || 0), 0);
  }, [activities, todayKey]);

  const goalPct = dailyGoal > 0 ? Math.min(100, Math.round((todayMinutes / dailyGoal) * 100)) : 0;

  // Real 7-day activity summary
  const last7Days = useMemo(() => {
    const days = getLast7DateKeys();
    return days.map((day) => {
      const dayActs = activities.filter((a) => a.dateKey === day.key);
      const mins = dayActs.reduce((acc, a) => acc + (a.durationMinutes || 0), 0);
      return {
        ...day,
        count: dayActs.length,
        minutes: mins,
        score: Math.max(dayActs.length, Math.ceil(mins / 15)),
      };
    });
  }, [activities]);

  const maxDayScore = Math.max(1, ...last7Days.map((d) => d.score));
  const activeInspectDay =
    hoveredDayIdx !== null ? last7Days[hoveredDayIdx] : last7Days[last7Days.length - 1];

  // Real Subject Distribution for color-segmented studio strip
  const subjectBreakdown = useMemo(() => {
    if (notes.length === 0) return [];
    const counts = new Map<string, number>();
    notes.forEach((n) => {
      const key = n.subjectId && subjectMap.has(n.subjectId) ? n.subjectId : '__general__';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([key, count]) => {
        if (key === '__general__') {
          return { id: key, name: 'General', hex: '#D8CEBB', count };
        }
        const subj = subjectMap.get(key)!;
        const hex = (SUBJECT_PALETTE[subj.color] || SUBJECT_PALETTE.sky).hex;
        return { id: key, name: subj.name, hex, count };
      })
      .sort((a, b) => b.count - a.count);
  }, [notes, subjectMap]);

  // SVG Focus Dial math (radius 54, circumference ~339.29)
  const dialRadius = 54;
  const dialCircumference = 2 * Math.PI * dialRadius;
  const lapProgress = (elapsedSeconds % FOCUS_LAP_SECONDS) / FOCUS_LAP_SECONDS;
  const dialOffset =
    elapsedSeconds === 0
      ? dialCircumference
      : dialCircumference * (1 - Math.max(0.02, lapProgress));

  const recentNotes = notes.slice(0, 5);
  const upcomingTasks = pendingTasks.slice(0, 5);

  // SVG 7-Day Activity Chart coordinates
  const svgW = 560;
  const svgH = 164;
  const chartTop = 18;
  const chartBottom = 132;
  const chartSpanY = chartBottom - chartTop;
  const colStep = svgW / 7;

  const chartPoints = last7Days.map((day, idx) => {
    const cx = colStep * idx + colStep / 2;
    const heightRatio = day.score === 0 ? 0.07 : Math.max(0.14, day.score / maxDayScore);
    const barH = Math.round(heightRatio * chartSpanY);
    const barY = chartBottom - barH;
    return { ...day, idx, cx, barH, barY };
  });

  const polylinePoints = chartPoints.map((pt) => `${pt.cx},${pt.barY}`).join(' ');

  return (
    <div className="space-y-8">
      {/* Personalized Welcome Hero + Obsidian Studio Focus Dial */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        <div className="xl:col-span-8 nv-studio-card rounded-2xl overflow-hidden flex flex-col justify-between">
          <div className="h-1.5 w-full nv-spectrum-bar" aria-hidden="true" />
          <div className="p-6 sm:p-7 flex-1 flex flex-col justify-between gap-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-7 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#8E2050]">
                    Your Knowledge. Your Way.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenProfile}
                    className="text-xs font-semibold text-[#5C566C] hover:text-[#1C1926] underline underline-offset-4 cursor-pointer"
                  >
                    Edit goal &amp; profile
                  </button>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1C1926]">
                  {getGreetingPrefix()}, {firstName}.
                </h2>
                <p className="text-sm text-[#5C566C] leading-relaxed">
                  {notes.length === 0 && tasks.length === 0
                    ? 'Your workspace is fresh and ready. Record a live lecture, drop in a study document, or create your first subject to start building your study library.'
                    : `You have ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} across ${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'} and ${pendingTasks.length} upcoming ${pendingTasks.length === 1 ? 'task' : 'tasks'}.`}
                </p>
              </div>

              <div className="hidden md:block md:col-span-5">
                <IllustrationFrame
                  src={NOTEVOX_ASSETS.heroStudio}
                  alt="Notevox tactile studio workstation"
                  fallbackType="notes"
                  className="aspect-[16/10] w-full shadow-xs"
                />
              </div>
            </div>

            {/* Daily Goal Progress Bar */}
            <div className="pt-4 border-t border-[#F0E9DC]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-[#1C1926]">Today&apos;s Study Goal</span>
                <span className="font-mono tabular-nums font-semibold text-[#5C566C]">
                  {todayMinutes} / {dailyGoal} min ({goalPct}%)
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-[#F3EEE2] overflow-hidden p-0.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${goalPct}%` }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full rounded-full nv-spectrum-bar"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Obsidian Hardware Focus Studio Dial */}
        <div className="xl:col-span-4 nv-hardware-deck rounded-2xl p-6 text-[#FFFDF8] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold tracking-tight text-[#FFFDF8]">Focus Studio Dial</div>
              <div className="text-[11px] font-mono text-[#B7B0C9]">25M LAP · REAL LOG</div>
            </div>
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                timerRunning ? 'bg-[#83D66F]' : 'bg-white/20'
              }`}
              aria-hidden="true"
            />
          </div>

          {/* Animated SVG Circular Progress Ring */}
          <div className="flex items-center justify-center py-1">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg
                viewBox="0 0 132 132"
                className="w-full h-full -rotate-90"
                aria-hidden="true"
              >
                {/* Precision dial bezel ticks */}
                {Array.from({ length: 24 }).map((_, i) => {
                  const angle = (i * 360) / 24;
                  return (
                    <line
                      key={i}
                      x1="66"
                      y1="4"
                      x2="66"
                      y2={i % 6 === 0 ? '9' : '7'}
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth={i % 6 === 0 ? '1.8' : '1'}
                      transform={`rotate(${angle} 66 66)`}
                    />
                  );
                })}
                {/* Track circle */}
                <circle
                  cx="66"
                  cy="66"
                  r={dialRadius}
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="7"
                />
                {/* Live Progress Arc */}
                <circle
                  cx="66"
                  cy="66"
                  r={dialRadius}
                  fill="none"
                  stroke={timerRunning ? '#83D66F' : '#FFD45C'}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={dialCircumference}
                  strokeDashoffset={dialOffset}
                  className="transition-all duration-300"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-mono font-bold tabular-nums tracking-tight text-[#FFFDF8]">
                  {formatDuration(elapsedSeconds)}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#B7B0C9] mt-0.5">
                  {timerRunning ? 'IN FOCUS' : elapsedSeconds > 0 ? 'PAUSED' : 'STANDBY'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSessionNotice(null);
                  setTimerRunning((prev) => !prev);
                }}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  timerRunning
                    ? 'bg-[#FFD45C] text-[#1C1926] hover:bg-[#F5C642]'
                    : 'bg-[#83D66F] text-[#1C1926] hover:bg-[#72C85D]'
                }`}
              >
                {timerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>
                  {timerRunning ? 'Pause' : elapsedSeconds > 0 ? 'Resume' : 'Start Focus'}
                </span>
              </button>

              {elapsedSeconds > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleLogFocusSession()}
                    disabled={loggingSession}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#62B8F5] text-[#1C1926] text-xs font-bold hover:bg-[#4FA9EB] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                    title="Log session to today's study progress"
                  >
                    <Square className="w-3 h-3" />
                    <span>{loggingSession ? 'Saving...' : 'Log'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimerRunning(false);
                      setElapsedSeconds(0);
                      setSessionNotice(null);
                    }}
                    aria-label="Reset focus timer"
                    className="p-2.5 rounded-xl bg-white/10 border border-white/15 text-[#E3DFF0] hover:bg-white/15 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
            {sessionNotice && (
              <p className="text-[11px] text-[#83D66F] font-medium text-center">{sessionNotice}</p>
            )}
          </div>
        </div>
      </section>

      {/* Quick Access Neo-Pop Studio Launch Cards */}
      <section aria-label="Quick access actions">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            {
              title: 'Record Lecture',
              desc: 'Live spectrum capture or audio upload with speech-to-text',
              icon: Mic,
              accent: 'bg-[#62B8F5]',
              onClick: () => onNavigate('recorder'),
            },
            {
              title: 'Upload Material',
              desc: 'Turn PDFs, DOCX, slides, or images into AI study kits',
              icon: FileUp,
              accent: 'bg-[#C9B6F5]',
              onClick: onQuickUploadDoc,
            },
            {
              title: 'Create Smart Note',
              desc: 'Write cleanly or structure rough class notes with AI',
              icon: FileText,
              accent: 'bg-[#F4A6C6]',
              onClick: onQuickNewNote,
            },
            {
              title: 'Organize Subjects',
              desc: 'Color-code courses to keep notes and tasks tidy',
              icon: FolderPlus,
              accent: 'bg-[#FFD45C]',
              onClick: () => onNavigate('subjects'),
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <motion.button
                key={card.title}
                type="button"
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.99 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                onClick={card.onClick}
                className="group nv-studio-card nv-studio-card-interactive text-left rounded-2xl overflow-hidden cursor-pointer"
              >
                <div className={`h-1.5 w-full ${card.accent}`} aria-hidden="true" />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3.5">
                    <span
                      className={`w-10 h-10 rounded-xl ${card.accent} text-[#1C1926] flex items-center justify-center shadow-xs`}
                    >
                      <Icon className="w-5 h-5" />
                    </span>
                    <ArrowRight className="w-4 h-4 text-[#7B748C] group-hover:text-[#1C1926] group-hover:translate-x-1 transition-all" />
                  </div>
                  <div className="font-bold text-base text-[#1C1926]">{card.title}</div>
                  <p className="text-xs text-[#5C566C] mt-1 leading-relaxed">{card.desc}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Honest Study Metrics + Interactive SVG 7-Day Activity Visualizer */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 nv-studio-card rounded-2xl p-6 flex flex-col justify-between gap-5">
          <div>
            <h3 className="text-base font-bold text-[#1C1926] mb-4">Your Real Study Totals</h3>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="p-4 rounded-xl bg-[#FDF2F7] border border-[#F4A6C6]/45">
                <div className="text-2xl font-mono font-bold tabular-nums text-[#1C1926]">
                  {notes.length}
                </div>
                <div className="text-xs font-semibold text-[#8E2050] mt-1">Notes Saved</div>
              </div>
              <div className="p-4 rounded-xl bg-[#EEF7FE] border border-[#62B8F5]/45">
                <div className="text-2xl font-mono font-bold tabular-nums text-[#1C1926]">
                  {audioNotesCount}
                </div>
                <div className="text-xs font-semibold text-[#145585] mt-1">Lectures Transcribed</div>
              </div>
              <div className="p-4 rounded-xl bg-[#F0FAED] border border-[#83D66F]/55">
                <div className="text-2xl font-mono font-bold tabular-nums text-[#1C1926]">
                  {completedTasksCount}
                </div>
                <div className="text-xs font-semibold text-[#226119] mt-1">Tasks Completed</div>
              </div>
              <div className="p-4 rounded-xl bg-[#FFF9E5] border border-[#FFD45C]/60">
                <div className="text-2xl font-mono font-bold tabular-nums text-[#1C1926]">
                  {subjects.length}
                </div>
                <div className="text-xs font-semibold text-[#7A5200] mt-1">Active Subjects</div>
              </div>
            </div>
          </div>

          {/* Honest Subject Color Distribution Bar (only rendered when user has saved notes) */}
          {subjectBreakdown.length > 0 && (
            <div className="pt-4 border-t border-[#F0E9DC] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#1C1926]">Notes by Subject</span>
                <span className="font-mono tabular-nums text-[#5C566C]">
                  {notes.length} total
                </span>
              </div>
              <div className="h-3 w-full rounded-full overflow-hidden flex gap-0.5 bg-[#F3EEE2]">
                {subjectBreakdown.map((seg) => (
                  <div
                    key={seg.id}
                    title={`${seg.name}: ${seg.count}`}
                    style={{
                      width: `${Math.max(6, Math.round((seg.count / notes.length) * 100))}%`,
                      backgroundColor: seg.hex,
                    }}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5C566C]">
                {subjectBreakdown.slice(0, 4).map((seg) => (
                  <span key={seg.id} className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-xs shrink-0"
                      style={{ backgroundColor: seg.hex }}
                      aria-hidden="true"
                    />
                    <span>{seg.name}</span>
                    <span className="font-mono tabular-nums text-[#1C1926] font-semibold">
                      {seg.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Interactive SVG 7-Day Activity Visualizer */}
        <div className="lg:col-span-7 nv-studio-card rounded-2xl p-6 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#1C1926]">7-Day Study Activity</h3>
              <p className="text-xs text-[#5C566C] mt-0.5">
                Hover or tap a day to inspect real logged minutes and study events
              </p>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-[#F8F4EA] border border-[#EAE3D5] text-xs font-mono tabular-nums text-[#1C1926]">
              <strong>{activeInspectDay.shortLabel}</strong> · {activeInspectDay.minutes}m ·{' '}
              {activeInspectDay.count} {activeInspectDay.count === 1 ? 'event' : 'events'}
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-44 min-w-[320px] select-none"
              role="img"
              aria-label="7-day study activity chart"
            >
              {/* Subtle horizontal drafting gridlines */}
              {[0, 0.33, 0.66, 1].map((frac, idx) => {
                const y = chartTop + chartSpanY * frac;
                return (
                  <line
                    key={idx}
                    x1="12"
                    x2={svgW - 12}
                    y1={y}
                    y2={y}
                    stroke="#ECE4D5"
                    strokeWidth="1"
                    strokeDasharray={idx === 3 ? undefined : '4 4'}
                  />
                );
              })}

              {/* Activity Columns */}
              {chartPoints.map((pt) => {
                const isInspected = activeInspectDay.key === pt.key;
                const fill =
                  pt.score === 0
                    ? '#EFE8D8'
                    : pt.isToday
                      ? '#62B8F5'
                      : isInspected
                        ? '#83D66F'
                        : '#C9B6F5';
                return (
                  <g
                    key={pt.key}
                    onMouseEnter={() => setHoveredDayIdx(pt.idx)}
                    onClick={() => setHoveredDayIdx(pt.idx)}
                    className="cursor-pointer"
                  >
                    {/* Invisible wider hover target */}
                    <rect
                      x={pt.cx - colStep / 2}
                      y={0}
                      width={colStep}
                      height={svgH}
                      fill="transparent"
                    />
                    <rect
                      x={pt.cx - 18}
                      y={pt.barY}
                      width={36}
                      height={pt.barH}
                      rx={8}
                      fill={fill}
                      stroke={isInspected ? '#1C1926' : 'transparent'}
                      strokeWidth={isInspected ? 1.5 : 0}
                    />
                    <text
                      x={pt.cx}
                      y={svgH - 8}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={pt.isToday || isInspected ? '700' : '500'}
                      fill={pt.isToday || isInspected ? '#1C1926' : '#5C566C'}
                    >
                      {pt.shortLabel}
                    </text>
                  </g>
                );
              })}

              {/* Smooth trend connector */}
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="#F4A6C6"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />

              {/* Trend vertex nodes */}
              {chartPoints.map((pt) => (
                <circle
                  key={`node-${pt.key}`}
                  cx={pt.cx}
                  cy={pt.barY}
                  r={activeInspectDay.key === pt.key ? 5 : 3.5}
                  fill="#FFFDF8"
                  stroke={pt.score > 0 ? '#8E2050' : '#C9C1B0'}
                  strokeWidth="2"
                  pointerEvents="none"
                />
              ))}
            </svg>
          </div>
        </div>
      </section>

      {/* Main Content Grid: Recent Notes & Subjects + Upcoming Study Tasks */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Recent Notes & Subjects */}
        <div className="lg:col-span-7 space-y-6">
          {/* Subjects Strip */}
          <div className="nv-studio-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#1C1926]">Your Subjects</h3>
              <button
                type="button"
                onClick={() => onNavigate('subjects')}
                className="text-xs font-semibold text-[#1C1926] hover:underline underline-offset-4 cursor-pointer"
              >
                Manage subjects
              </button>
            </div>

            {subjects.length === 0 ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-2">
                <p className="text-sm text-[#5C566C]">
                  No subjects added yet. Group your lectures, documents, and deadlines by class.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('subjects')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFD45C] text-[#1C1926] text-xs font-bold hover:bg-[#F5C642] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create First Subject
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {subjects.slice(0, 6).map((subject) => {
                  const palette = SUBJECT_PALETTE[subject.color] || SUBJECT_PALETTE.sky;
                  const noteCount = notes.filter((n) => n.subjectId === subject.id).length;
                  const openTaskCount = pendingTasks.filter((t) => t.subjectId === subject.id).length;
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => onOpenSubjectNotes(subject.id)}
                      className="flex items-center gap-3 p-3.5 rounded-xl bg-[#FFFDF8] border border-[#EAE3D5] hover:border-[#1C1926] transition-colors text-left cursor-pointer"
                    >
                      <span
                        className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs text-[#1C1926] ${palette.swatchClass}`}
                      >
                        {subject.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[#1C1926] truncate">
                          {subject.name}
                        </div>
                        <div className="text-xs text-[#5C566C] mt-0.5 tabular-nums">
                          {subject.code ? `${subject.code} · ` : ''}
                          {noteCount} {noteCount === 1 ? 'note' : 'notes'} · {openTaskCount}{' '}
                          {openTaskCount === 1 ? 'task' : 'tasks'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Notes */}
          <div className="nv-studio-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#1C1926]">Recent Notes</h3>
              {notes.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('notes')}
                  className="text-xs font-semibold text-[#1C1926] hover:underline underline-offset-4 cursor-pointer"
                >
                  Open workspace
                </button>
              )}
            </div>

            {recentNotes.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center py-2">
                <div className="sm:col-span-5">
                  <IllustrationFrame
                    src={NOTEVOX_ASSETS.notesDesk}
                    alt="Notevox studio desk ready for your first lecture or document"
                    fallbackType="notes"
                    className="aspect-[16/10] w-full"
                  />
                </div>
                <div className="sm:col-span-7 space-y-3">
                  <h4 className="text-lg font-bold text-[#1C1926]">Your notebook is waiting</h4>
                  <p className="text-sm text-[#5C566C] leading-relaxed">
                    Record your next lecture or drop in a PDF, Word file, or slide photo. Notevox
                    will transcribe speech, organize clean study notes, and generate 3D flashcards.
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigate('recorder')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#62B8F5] text-[#1C1926] text-xs font-bold hover:bg-[#4FA9EB] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      Record Lecture
                    </button>
                    <button
                      type="button"
                      onClick={onQuickUploadDoc}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F7F2E7] border border-[#E5DCCB] text-[#1C1926] text-xs font-semibold hover:bg-[#EFE9DC] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <FileUp className="w-3.5 h-3.5" />
                      Upload Document
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#F0E9DC]">
                {recentNotes.map((note) => {
                  const subj = note.subjectId ? subjectMap.get(note.subjectId) : undefined;
                  const sourceLabel =
                    note.sourceType === 'audio'
                      ? 'Audio Lecture'
                      : note.sourceType === 'document'
                        ? 'Document'
                        : 'Manual Note';
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => onOpenNote(note.id)}
                      className="w-full py-3.5 first:pt-1 last:pb-1 text-left flex items-start justify-between gap-4 hover:bg-[#FFFDF8] rounded-lg px-2 -mx-2 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[#1C1926] truncate">
                          {note.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5C566C] mt-1">
                          {subj && (
                            <>
                              <span className="font-medium text-[#1C1926]">{subj.name}</span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span>{sourceLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{note.wordCount} words</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatTimestampDate(note.updatedAt)}</span>
                        </div>
                      </div>
                      <BookOpen className="w-4 h-4 text-[#7B748C] shrink-0 mt-1" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Upcoming Study Tasks & Reminders */}
        <div className="lg:col-span-5 nv-studio-card rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#1C1926]">Upcoming Tasks &amp; Reminders</h3>
              <p className="text-xs text-[#5C566C] mt-0.5 tabular-nums">
                {pendingTasks.length} pending
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="text-xs font-semibold text-[#1C1926] hover:underline underline-offset-4 cursor-pointer"
            >
              View all
            </button>
          </div>

          {/* Quick Inline Add Task */}
          <form onSubmit={handleQuickAddTask} className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                placeholder="Add a study task or deadline..."
                maxLength={160}
                className="flex-1 h-10 px-3.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm text-[#1C1926] placeholder:text-[#8E879E] focus:border-[#1C1926] focus:outline-none"
              />
              <button
                type="submit"
                disabled={addingQuickTask || !quickTaskTitle.trim()}
                className="h-10 px-3.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold hover:bg-[#312C42] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Add
              </button>
            </div>
            {quickTaskTitle.trim().length > 0 && (
              <div className="flex items-center gap-2 text-xs text-[#5C566C]">
                <Clock className="w-3.5 h-3.5" />
                <label htmlFor="quick-due" className="whitespace-nowrap">
                  Due date:
                </label>
                <input
                  id="quick-due"
                  type="date"
                  value={quickTaskDue}
                  onChange={(e) => setQuickTaskDue(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-[#E5DCCB] bg-[#FFFDF8] text-xs text-[#1C1926]"
                />
              </div>
            )}
          </form>

          {upcomingTasks.length === 0 ? (
            <div className="space-y-4 pt-1">
              <IllustrationFrame
                src={NOTEVOX_ASSETS.tasksPlanner}
                alt="Matte flip-clock timer and vibrant pastel study tiles"
                fallbackType="tasks"
                className="aspect-[4/3] w-full max-w-[280px] mx-auto"
              />
              <div className="text-center space-y-1.5">
                <h4 className="text-base font-bold text-[#1C1926]">No upcoming deadlines</h4>
                <p className="text-xs text-[#5C566C] max-w-xs mx-auto leading-relaxed">
                  Add exam dates, problem sets, or reading reminders above so nothing slips past you.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#F0E9DC]">
              {upcomingTasks.map((task) => {
                const due = formatDueDate(task.dueDate);
                const subj = task.subjectId ? subjectMap.get(task.subjectId) : undefined;
                return (
                  <div key={task.id} className="py-3 first:pt-1 last:pb-1 flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => void toggleTaskCompleted(task)}
                      aria-label={`Mark "${task.title}" complete`}
                      className="mt-0.5 w-5 h-5 rounded-md border border-[#C9C1B0] hover:border-[#1C1926] hover:bg-[#F0FAED] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    >
                      {task.completed && <Check className="w-3.5 h-3.5 text-[#226119]" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[#1C1926] leading-snug">
                        {task.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5C566C] mt-1">
                        <span className={due.isOverdue ? 'text-[#A62448] font-semibold' : ''}>
                          {due.label}
                        </span>
                        {subj && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{subj.name}</span>
                          </>
                        )}
                        {task.reminderEnabled && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-[#7A5200]">
                              <Bell className="w-3 h-3" />
                              Reminder
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Compact Recent Activity Footnote */}
          {activities.length > 0 && (
            <div className="pt-4 border-t border-[#F0E9DC]">
              <div className="text-xs font-semibold text-[#5C566C] mb-2">Latest Activity</div>
              <div className="space-y-1.5">
                {activities.slice(0, 3).map((act) => (
                  <div
                    key={act.id}
                    className="flex items-center justify-between gap-2 text-xs text-[#5C566C]"
                  >
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#226119] shrink-0" />
                      <span className="truncate text-[#1C1926]">{act.label}</span>
                    </span>
                    <span className="shrink-0 text-[#7B748C]">
                      {formatTimestampDate(act.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
