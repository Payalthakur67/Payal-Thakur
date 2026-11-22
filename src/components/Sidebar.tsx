import {
  LayoutDashboard,
  FileText,
  Mic,
  FolderKanban,
  CheckSquare,
  CreditCard,
  Download,
  LogOut,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useNotevox } from '../context/NotevoxContext';
import type { NavView } from '../types';
import { NotevoxLogo } from './NotevoxLogo';

interface SidebarProps {
  activeView: NavView;
  onNavigate: (view: NavView) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenProfile: () => void;
}

const NAV_ITEMS: {
  id: NavView;
  label: string;
  icon: typeof LayoutDashboard;
  accentBg: string;
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, accentBg: 'bg-[#FFD45C]' },
  { id: 'notes', label: 'AI Notes', icon: FileText, accentBg: 'bg-[#F4A6C6]' },
  { id: 'recorder', label: 'Lecture Studio', icon: Mic, accentBg: 'bg-[#62B8F5]' },
  { id: 'subjects', label: 'Subjects', icon: FolderKanban, accentBg: 'bg-[#C9B6F5]' },
  { id: 'tasks', label: 'Study Tasks', icon: CheckSquare, accentBg: 'bg-[#83D66F]' },
  { id: 'billing', label: 'Plans & Billing', icon: CreditCard, accentBg: 'bg-[#FFD45C]' },
];

export function Sidebar({
  activeView,
  onNavigate,
  mobileOpen,
  onCloseMobile,
  onOpenProfile,
}: SidebarProps) {
  const { profile, user, notes, tasks, subjects, signOutUser } = useNotevox();

  const pendingTaskCount = tasks.filter((t) => !t.completed).length;

  function getCountForNav(id: NavView): number | null {
    if (id === 'notes' && notes.length > 0) return notes.length;
    if (id === 'subjects' && subjects.length > 0) return subjects.length;
    if (id === 'tasks' && pendingTaskCount > 0) return pendingTaskCount;
    return null;
  }

  const displayName = profile?.displayName || user?.displayName || 'Student';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('');

  const planLabel =
    profile?.planId === 'campus'
      ? 'Campus Pack'
      : profile?.planId === 'scholar'
        ? 'Scholar Pro'
        : 'Starter Plan';

  const sidebarInner = (
    <div className="flex flex-col h-full bg-[#F8F4EA] border-r border-[#EAE3D5] text-[#1C1926]">
      <div className="h-1 w-full nv-spectrum-bar shrink-0" aria-hidden="true" />
      {/* Brand Header */}
      <div className="px-5 py-5 flex items-center justify-between border-b border-[#EAE3D5]">
        <button
          type="button"
          onClick={() => {
            onNavigate('dashboard');
            onCloseMobile();
          }}
          className="text-left focus-visible:outline-none cursor-pointer"
        >
          <NotevoxLogo size="md" />
          <p className="text-[11px] text-[#5C566C] mt-1 pl-0.5">Your Knowledge. Your Way.</p>
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-2 rounded-lg text-[#5C566C] hover:bg-[#ECE5D5] hover:text-[#1C1926]"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          const count = getCountForNav(item.id);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-white text-[#1C1926] border border-[#1C1926] font-semibold shadow-xs'
                  : 'text-[#4C475C] hover:bg-[#EFE9DC] hover:text-[#1C1926] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isActive ? `${item.accentBg} text-[#1C1926]` : 'bg-transparent text-[#5C566C]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="truncate">{item.label}</span>
              </span>
              {count !== null && (
                <span className="text-xs font-mono tabular-nums text-[#5C566C] shrink-0">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Account Footer */}
      <div className="p-4 border-t border-[#EAE3D5] space-y-2.5">
        <button
          type="button"
          onClick={() => {
            onOpenProfile();
            onCloseMobile();
          }}
          className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#E8E0D0] hover:border-[#D4C9B3] transition-colors text-left cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-[#C9B6F5] text-[#1C1926] font-bold text-xs flex items-center justify-center shrink-0">
            {initials || 'ST'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[#1C1926] truncate">{displayName}</div>
            <div className="text-xs text-[#5C566C] truncate">
              {planLabel}
              {profile?.majorOrGrade ? ` · ${profile.majorOrGrade}` : ''}
            </div>
          </div>
          <SlidersHorizontal className="w-4 h-4 text-[#5C566C] shrink-0" />
        </button>

        <div className="space-y-1.5">
          <a
            href="/api/export/notevox-onefile.mjs"
            download="notevox-onefile.mjs"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E5DCCB] text-xs font-semibold text-[#1C1926] hover:bg-[#EFE9DC] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#145585]" />
            One-File Code (.mjs)
          </a>
          <div className="grid grid-cols-2 gap-1.5">
            <a
              href="/api/export/notevox-single.html"
              download="notevox-single.html"
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[#FFFDF8] border border-[#EAE3D5] text-[11px] font-medium text-[#4C475C] hover:bg-[#EFE9DC] hover:text-[#1C1926] transition-colors cursor-pointer"
            >
              Single HTML
            </a>
            <a
              href="/api/export/notevox-website.zip"
              download="notevox-website.zip"
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[#FFFDF8] border border-[#EAE3D5] text-[11px] font-medium text-[#4C475C] hover:bg-[#EFE9DC] hover:text-[#1C1926] transition-colors cursor-pointer"
            >
              Full ZIP
            </a>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void signOutUser()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[#5C566C] hover:bg-[#EFE9DC] hover:text-[#1C1926] transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Static Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarInner}
      </aside>

      {/* Mobile & Tablet Slide-over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#1C1926]/35 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full shadow-xl">
            {sidebarInner}
          </aside>
        </div>
      )}
    </>
  );
}
