import type { Timestamp } from 'firebase/firestore';
import type { SubjectColor, NoteStyle } from '../types';

export interface PaletteToken {
  key: SubjectColor;
  label: string;
  hex: string;
  softBg: string;
  borderHex: string;
  inkText: string;
  swatchClass: string;
  softSurfaceClass: string;
  inkTextClass: string;
}

export const SUBJECT_PALETTE: Record<SubjectColor, PaletteToken> = {
  pink: {
    key: 'pink',
    label: 'Blossom Pink',
    hex: '#F4A6C6',
    softBg: '#FDF2F7',
    borderHex: '#F2C6D8',
    inkText: '#8E2050',
    swatchClass: 'bg-[#F4A6C6]',
    softSurfaceClass: 'bg-[#FDF2F7]',
    inkTextClass: 'text-[#8E2050]',
  },
  green: {
    key: 'green',
    label: 'Meadow Green',
    hex: '#83D66F',
    softBg: '#F0FAED',
    borderHex: '#BFE8B4',
    inkText: '#226119',
    swatchClass: 'bg-[#83D66F]',
    softSurfaceClass: 'bg-[#F0FAED]',
    inkTextClass: 'text-[#226119]',
  },
  sky: {
    key: 'sky',
    label: 'Sky Blue',
    hex: '#62B8F5',
    softBg: '#EEF7FE',
    borderHex: '#B4DCFA',
    inkText: '#145585',
    swatchClass: 'bg-[#62B8F5]',
    softSurfaceClass: 'bg-[#EEF7FE]',
    inkTextClass: 'text-[#145585]',
  },
  yellow: {
    key: 'yellow',
    label: 'Sunshine Yellow',
    hex: '#FFD45C',
    softBg: '#FFF9E5',
    borderHex: '#F5DF98',
    inkText: '#7A5200',
    swatchClass: 'bg-[#FFD45C]',
    softSurfaceClass: 'bg-[#FFF9E5]',
    inkTextClass: 'text-[#7A5200]',
  },
  lavender: {
    key: 'lavender',
    label: 'Soft Lavender',
    hex: '#C9B6F5',
    softBg: '#F5F1FE',
    borderHex: '#DDD1FA',
    inkText: '#4D3290',
    swatchClass: 'bg-[#C9B6F5]',
    softSurfaceClass: 'bg-[#F5F1FE]',
    inkTextClass: 'text-[#4D3290]',
  },
};

export const SUBJECT_COLOR_LIST: PaletteToken[] = [
  SUBJECT_PALETTE.sky,
  SUBJECT_PALETTE.pink,
  SUBJECT_PALETTE.green,
  SUBJECT_PALETTE.yellow,
  SUBJECT_PALETTE.lavender,
];

export const NOTE_STYLE_META: Record<
  NoteStyle,
  { label: string; description: string }
> = {
  structured: {
    label: 'Structured Study Notes',
    description: 'Clear topic sections, definitions, and organized bullets.',
  },
  cornell: {
    label: 'Cornell Method',
    description: 'Key cue questions, detailed notes, and synthesis summary.',
  },
  revision: {
    label: 'Exam Revision Sheet',
    description: 'High-yield concepts, key frameworks, and quick self-checks.',
  },
  summary: {
    label: 'Actionable Summary',
    description: 'Concise big-picture overview with focused next study steps.',
  },
};

export function getTodayDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLast7DateKeys(): { key: string; shortLabel: string; isToday: boolean }[] {
  const result: { key: string; shortLabel: string; isToday: boolean }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = getTodayDateKey(d);
    const shortLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
    result.push({ key, shortLabel, isToday: i === 0 });
  }
  return result;
}

export function getGreetingPrefix(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDurationHuman(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function timestampToMillis(ts?: Timestamp | null): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  return 0;
}

export function formatTimestampDate(ts?: Timestamp | null): string {
  const ms = timestampToMillis(ts);
  if (!ms) return 'Just now';
  const date = new Date(ms);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - ms) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDueDate(dueDate: string): { label: string; isOverdue: boolean; isToday: boolean } {
  if (!dueDate) return { label: 'No due date', isOverdue: false, isToday: false };
  const todayKey = getTodayDateKey();
  const datePart = dueDate.slice(0, 10);
  const parsed = new Date(dueDate.includes('T') ? dueDate : `${dueDate}T23:59:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { label: dueDate, isOverdue: false, isToday: false };
  }
  const isToday = datePart === todayKey;
  const isOverdue = !isToday && datePart < todayKey;
  const formatted = parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const timePart = dueDate.includes('T')
    ? ` · ${parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : '';
  return {
    label: isToday ? `Today${timePart}` : `${formatted}${timePart}`,
    isOverdue,
    isToday,
  };
}

export function formatCurrencyCents(subunits: number, currency: 'INR' | 'USD' = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : '$';
  if (subunits === 0) return `${symbol}0`;
  const major = subunits / 100;
  const formatted = Number.isInteger(major)
    ? major.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US')
    : major.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  return `${symbol}${formatted}`;
}
