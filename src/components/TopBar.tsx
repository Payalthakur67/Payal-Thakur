import { Menu, Mic, Plus, Search, X } from 'lucide-react';
import type { NavView } from '../types';

interface TopBarProps {
  activeView: NavView;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenMobileMenu: () => void;
  onPrimaryAction: () => void;
}

const VIEW_TITLES: Record<NavView, string> = {
  dashboard: 'Dashboard',
  notes: 'AI Notes Workspace',
  recorder: 'Lecture Studio',
  subjects: 'Subjects',
  tasks: 'Study Tasks & Reminders',
  billing: 'Plans & Billing',
};

export function TopBar({
  activeView,
  searchQuery,
  onSearchChange,
  onOpenMobileMenu,
  onPrimaryAction,
}: TopBarProps) {
  const isRecorder = activeView === 'recorder';

  return (
    <header className="sticky top-0 z-30 bg-[#FFFDF8]/95 backdrop-blur-sm border-b border-[#EAE3D5]">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-6">
        {/* Zone 1: Menu Trigger + Contextual Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 -ml-2 rounded-xl text-[#1C1926] hover:bg-[#F3EEE2] transition-colors shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="hidden sm:inline text-[#7B748C] whitespace-nowrap">Notevox</span>
            <span className="hidden sm:inline text-[#C9C1B0]" aria-hidden="true">/</span>
            <h1 className="text-base sm:text-lg font-bold text-[#1C1926] truncate">
              {VIEW_TITLES[activeView]}
            </h1>
          </div>
        </div>

        {/* Zone 2: Functional Workspace Search */}
        <div className="hidden md:flex items-center flex-1 max-w-md relative">
          <Search className="w-4 h-4 text-[#7B748C] absolute left-3.5 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search notes, transcripts, or tasks..."
            aria-label="Search notes, transcripts, or tasks"
            className="w-full h-10 pl-10 pr-9 rounded-xl bg-white border border-[#E5DCCB] text-sm text-[#1C1926] placeholder:text-[#8E879E] focus:border-[#1C1926] focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2.5 p-1 rounded-md text-[#7B748C] hover:text-[#1C1926]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs sm:text-sm font-semibold hover:bg-[#312C42] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isRecorder ? (
              <>
                <Plus className="w-4 h-4" />
                <span>New Note</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-[#62B8F5]" />
                <span>Record Lecture</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
