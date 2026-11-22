import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, FileText, Loader2, CheckSquare } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { BillingView } from './components/BillingView';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LectureStudioView } from './components/LectureStudioView';
import { NotesWorkspaceView } from './components/NotesWorkspaceView';
import { NotevoxLogo } from './components/NotevoxLogo';
import { ProfileModal } from './components/ProfileModal';
import { Sidebar } from './components/Sidebar';
import { SubjectsView } from './components/SubjectsView';
import { TasksView } from './components/TasksView';
import { TopBar } from './components/TopBar';
import { NotevoxProvider, useNotevox } from './context/NotevoxContext';
import type { NavView } from './types';

function WorkspaceShell() {
  const { user, authLoading, dataReady, notes, tasks } = useNotevox();

  const [activeView, setActiveView] = useState<NavView>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [subjectFilterForNotes, setSubjectFilterForNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Signals to trigger Upload Material or New Note modal from Dashboard quick actions
  const [uploadSignal, setUploadSignal] = useState(0);
  const [newNoteSignal, setNewNoteSignal] = useState(0);

  const globalSearchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || activeView === 'notes' || activeView === 'tasks') return null;
    const matchedNotes = notes
      .filter((n) => `${n.title} ${n.summary} ${n.content} ${n.transcript}`.toLowerCase().includes(q))
      .slice(0, 4);
    const matchedTasks = tasks
      .filter((t) => `${t.title} ${t.details}`.toLowerCase().includes(q))
      .slice(0, 4);
    return { matchedNotes, matchedTasks };
  }, [searchQuery, activeView, notes, tasks]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FFFDF8] flex flex-col items-center justify-center gap-4 p-6">
        <NotevoxLogo size="lg" />
        <div className="inline-flex items-center gap-2 text-xs text-[#5C566C]">
          <Loader2 className="w-4 h-4 animate-spin text-[#62B8F5]" />
          <span>Loading your workspace...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthGate />;
  }

  if (!dataReady) {
    return (
      <div className="min-h-screen bg-[#FFFDF8] flex flex-col items-center justify-center gap-4 p-6">
        <NotevoxLogo size="lg" />
        <div className="inline-flex items-center gap-2 text-xs text-[#5C566C]">
          <Loader2 className="w-4 h-4 animate-spin text-[#F4A6C6]" />
          <span>Syncing your notes, subjects, and study tasks...</span>
        </div>
      </div>
    );
  }

  function handleOpenNote(noteId: string) {
    setSelectedNoteId(noteId);
    setSubjectFilterForNotes('');
    setActiveView('notes');
    setSearchQuery('');
  }

  function handleOpenSubjectNotes(subjectId: string) {
    setSubjectFilterForNotes(subjectId);
    setSelectedNoteId(null);
    setActiveView('notes');
  }

  function handleQuickUploadDoc() {
    setActiveView('notes');
    setUploadSignal((s) => s + 1);
  }

  function handleQuickNewNote() {
    setActiveView('notes');
    setNewNoteSignal((s) => s + 1);
  }

  function handleTopBarPrimaryAction() {
    if (activeView === 'recorder') {
      handleQuickNewNote();
    } else {
      setActiveView('recorder');
    }
  }

  return (
    <div className="min-h-screen nv-dot-canvas text-[#1C1926] flex">
      <Sidebar
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          if (view !== 'notes') setSubjectFilterForNotes('');
        }}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeView={activeView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onPrimaryAction={handleTopBarPrimaryAction}
        />

        <main className="flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Live Global Search Quick Results Panel (when searching outside Notes/Tasks) */}
          {globalSearchMatches && (
            <div className="mb-6 bg-white border border-[#1C1926] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#1C1926]">
                  Search results for &ldquo;{searchQuery}&rdquo;
                </span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-[#5C566C] hover:text-[#1C1926] font-medium cursor-pointer"
                >
                  Clear
                </button>
              </div>

              {globalSearchMatches.matchedNotes.length === 0 &&
              globalSearchMatches.matchedTasks.length === 0 ? (
                <p className="text-xs text-[#5C566C]">
                  No notes, transcripts, or tasks matched your query.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {globalSearchMatches.matchedNotes.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-[#5C566C]">Notes</div>
                      {globalSearchMatches.matchedNotes.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleOpenNote(n.id)}
                          className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#FFFDF8] border border-[#EAE3D5] hover:border-[#1C1926] text-left text-xs font-medium text-[#1C1926] cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-2 truncate">
                            <FileText className="w-3.5 h-3.5 text-[#8E2050] shrink-0" />
                            <span className="truncate">{n.title}</span>
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#7B748C] shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {globalSearchMatches.matchedTasks.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-[#5C566C]">Study Tasks</div>
                      {globalSearchMatches.matchedTasks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setActiveView('tasks')}
                          className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#FFFDF8] border border-[#EAE3D5] hover:border-[#1C1926] text-left text-xs font-medium text-[#1C1926] cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-2 truncate">
                            <CheckSquare className="w-3.5 h-3.5 text-[#226119] shrink-0" />
                            <span className="truncate">{t.title}</span>
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#7B748C] shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {activeView === 'dashboard' && (
              <DashboardView
                onNavigate={setActiveView}
                onOpenNote={handleOpenNote}
                onOpenSubjectNotes={handleOpenSubjectNotes}
                onQuickUploadDoc={handleQuickUploadDoc}
                onQuickNewNote={handleQuickNewNote}
                onOpenProfile={() => setShowProfileModal(true)}
              />
            )}

            {activeView === 'notes' && (
              <NotesWorkspaceView
                selectedNoteId={selectedNoteId}
                onSelectNote={setSelectedNoteId}
                initialSubjectFilter={subjectFilterForNotes}
                searchQuery={searchQuery}
                openUploadSignal={uploadSignal}
                openNewNoteSignal={newNoteSignal}
                onGoToRecorder={() => setActiveView('recorder')}
              />
            )}

            {activeView === 'recorder' && (
              <LectureStudioView onOpenNote={handleOpenNote} />
            )}

            {activeView === 'subjects' && (
              <SubjectsView onOpenSubjectNotes={handleOpenSubjectNotes} />
            )}

            {activeView === 'tasks' && <TasksView searchQuery={searchQuery} />}

            {activeView === 'billing' && <BillingView />}
          </motion.div>
        </main>
      </div>

      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <NotevoxProvider>
        <WorkspaceShell />
      </NotevoxProvider>
    </ErrorBoundary>
  );
}
