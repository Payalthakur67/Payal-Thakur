import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileText,
  FileUp,
  HelpCircle,
  Layers,
  Loader2,
  MessageSquare,
  Mic,
  Pin,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import { useNotevox } from '../context/NotevoxContext';
import {
  askNoteApi,
  generateFlashcardsApi,
  generateNotesFromTextApi,
  processDocumentApi,
  synthesizeTtsApi,
} from '../lib/api';
import { NOTEVOX_ASSETS } from '../lib/assets';
import {
  formatDurationHuman,
  formatTimestampDate,
  NOTE_STYLE_META,
  SUBJECT_PALETTE,
} from '../lib/palette';
import type { Note, NoteStyle, SourceType, SuggestedStudyTask } from '../types';
import { IllustrationFrame } from './IllustrationFrame';

interface NotesWorkspaceViewProps {
  selectedNoteId: string | null;
  onSelectNote: (noteId: string | null) => void;
  initialSubjectFilter?: string;
  searchQuery: string;
  openUploadSignal: number;
  openNewNoteSignal: number;
  onGoToRecorder: () => void;
}

type InnerTab = 'notes' | 'transcript' | 'flashcards' | 'ask';

export function NotesWorkspaceView({
  selectedNoteId,
  onSelectNote,
  initialSubjectFilter = '',
  searchQuery,
  openUploadSignal,
  openNewNoteSignal,
  onGoToRecorder,
}: NotesWorkspaceViewProps) {
  const {
    notes,
    subjects,
    createNote,
    updateNote,
    togglePinNote,
    updateNoteFlashcards,
    deleteNote,
    createTask,
  } = useNotevox();

  const [subjectFilter, setSubjectFilter] = useState(initialSubjectFilter);
  const [sourceFilter, setSourceFilter] = useState<'all' | SourceType>('all');
  const [innerTab, setInnerTab] = useState<InnerTab>('notes');

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation (inline, never window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modals: Upload Document & New / Paste-to-AI Note
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);

  // Upload Document form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSubjectId, setUploadSubjectId] = useState('');
  const [uploadStyle, setUploadStyle] = useState<NoteStyle>('structured');
  const [uploadInstructions, setUploadInstructions] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recentSuggestedTasks, setRecentSuggestedTasks] = useState<{
    noteId: string;
    subjectId: string;
    tasks: SuggestedStudyTask[];
    added: Record<number, boolean>;
  } | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  // New Note / Paste-to-AI Modal state
  const [newMode, setNewMode] = useState<'ai' | 'blank'>('ai');
  const [newTitle, setNewTitle] = useState('');
  const [newSubjectId, setNewSubjectId] = useState('');
  const [newStyle, setNewStyle] = useState<NoteStyle>('structured');
  const [newRawText, setNewRawText] = useState('');
  const [creatingNote, setCreatingNote] = useState(false);
  const [newNoteError, setNewNoteError] = useState<string | null>(null);

  // Flashcards state
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [newCardFront, setNewCardFront] = useState('');
  const [newCardBack, setNewCardBack] = useState('');
  const [showAddCard, setShowAddCard] = useState(false);

  // AI Re-synthesize & TTS & Ask Note state
  const [resynthesizing, setResynthesizing] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const [qaMessages, setQaMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);

  useEffect(() => {
    setSubjectFilter(initialSubjectFilter);
  }, [initialSubjectFilter]);

  useEffect(() => {
    if (openUploadSignal > 0) {
      setShowUploadModal(true);
      setUploadError(null);
    }
  }, [openUploadSignal]);

  useEffect(() => {
    if (openNewNoteSignal > 0) {
      setShowNewNoteModal(true);
      setNewNoteError(null);
    }
  }, [openNewNoteSignal]);

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((n) => {
      if (subjectFilter && n.subjectId !== subjectFilter) return false;
      if (sourceFilter !== 'all' && n.sourceType !== sourceFilter) return false;
      if (q) {
        const hay = `${n.title} ${n.summary} ${n.content} ${n.transcript}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [notes, subjectFilter, sourceFilter, searchQuery]);

  const activeNote: Note | null = useMemo(() => {
    if (selectedNoteId) {
      const found = notes.find((n) => n.id === selectedNoteId);
      if (found) return found;
    }
    return filteredNotes[0] || null;
  }, [notes, filteredNotes, selectedNoteId]);

  // Reset per-note ephemeral UI state when switching active note
  useEffect(() => {
    setIsEditing(false);
    setConfirmDeleteId(null);
    setCardIndex(0);
    setCardFlipped(false);
    setQaMessages([]);
    setQaInput('');
    setWorkspaceError(null);
    setTtsAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (activeNote && !activeNote.transcript && innerTab === 'transcript') {
      setInnerTab('notes');
    }
  }, [activeNote?.id]);

  function enterEditMode(note: Note) {
    setEditTitle(note.title);
    setEditSummary(note.summary);
    setEditContent(note.content);
    setIsEditing(true);
    setInnerTab('notes');
  }

  async function saveEditedNote() {
    if (!activeNote) return;
    setSavingEdit(true);
    setWorkspaceError(null);
    try {
      await updateNote(activeNote.id, {
        title: editTitle.trim() || activeNote.title,
        summary: editSummary,
        content: editContent,
      });
      setIsEditing(false);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Unable to save note changes.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleProcessDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Select a PDF, DOCX, TXT, MD, CSV, or slide image first.');
      return;
    }
    setUploadingDoc(true);
    setUploadError(null);

    const subj = uploadSubjectId ? subjectMap.get(uploadSubjectId) : undefined;
    try {
      const { note } = await processDocumentApi({
        file: uploadFile,
        noteStyle: uploadStyle,
        subjectName: subj?.name,
        customInstructions: uploadInstructions.trim() || undefined,
      });

      const createdId = await createNote({
        title: note.title,
        subjectId: uploadSubjectId,
        sourceType: 'document',
        noteStyle: uploadStyle,
        sourceFileName: uploadFile.name,
        summary: note.summary,
        content: note.content,
        transcript: note.extractedPreview || '',
        keyTakeaways: note.keyTakeaways,
        flashcards: note.flashcards,
      });

      if (note.suggestedTasks.length > 0) {
        setRecentSuggestedTasks({
          noteId: createdId,
          subjectId: uploadSubjectId,
          tasks: note.suggestedTasks,
          added: {},
        });
      }

      onSelectNote(createdId);
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadInstructions('');
      if (docInputRef.current) docInputRef.current.value = '';
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to process document.');
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleCreateNewNote(e: React.FormEvent) {
    e.preventDefault();
    setNewNoteError(null);

    if (newMode === 'blank') {
      if (!newTitle.trim()) {
        setNewNoteError('Please enter a title for your note.');
        return;
      }
      setCreatingNote(true);
      try {
        const id = await createNote({
          title: newTitle.trim(),
          subjectId: newSubjectId,
          sourceType: 'manual',
          noteStyle: newStyle,
          content: newRawText.trim(),
        });
        onSelectNote(id);
        setShowNewNoteModal(false);
        setNewTitle('');
        setNewRawText('');
      } catch (err) {
        setNewNoteError(err instanceof Error ? err.message : 'Unable to create note.');
      } finally {
        setCreatingNote(false);
      }
      return;
    }

    // Paste-to-AI structured mode
    if (newRawText.trim().length < 15) {
      setNewNoteError('Paste at least a few sentences of rough notes or reading text to structure with AI.');
      return;
    }
    setCreatingNote(true);
    const subj = newSubjectId ? subjectMap.get(newSubjectId) : undefined;
    try {
      const { note } = await generateNotesFromTextApi({
        sourceText: newRawText,
        sourceTitle: newTitle.trim() || undefined,
        noteStyle: newStyle,
        subjectName: subj?.name,
      });

      const id = await createNote({
        title: newTitle.trim() || note.title,
        subjectId: newSubjectId,
        sourceType: 'manual',
        noteStyle: newStyle,
        summary: note.summary,
        content: note.content,
        keyTakeaways: note.keyTakeaways,
        flashcards: note.flashcards,
      });

      if (note.suggestedTasks.length > 0) {
        setRecentSuggestedTasks({
          noteId: id,
          subjectId: newSubjectId,
          tasks: note.suggestedTasks,
          added: {},
        });
      }

      onSelectNote(id);
      setShowNewNoteModal(false);
      setNewTitle('');
      setNewRawText('');
    } catch (err) {
      setNewNoteError(err instanceof Error ? err.message : 'Unable to generate AI notes.');
    } finally {
      setCreatingNote(false);
    }
  }

  async function handleResynthesize(targetStyle: NoteStyle) {
    if (!activeNote) return;
    const baseText = activeNote.transcript || activeNote.content;
    if (!baseText || baseText.trim().length < 15) {
      setWorkspaceError('Add more content or a transcript before restructuring with AI.');
      return;
    }
    setResynthesizing(true);
    setWorkspaceError(null);
    const subj = activeNote.subjectId ? subjectMap.get(activeNote.subjectId) : undefined;
    try {
      const { note } = await generateNotesFromTextApi({
        sourceText: baseText,
        sourceTitle: activeNote.title,
        noteStyle: targetStyle,
        subjectName: subj?.name,
      });
      await updateNote(activeNote.id, {
        title: activeNote.title,
        noteStyle: targetStyle,
        summary: note.summary,
        content: note.content,
        keyTakeaways: note.keyTakeaways,
        flashcards: note.flashcards.length > 0 ? note.flashcards : activeNote.flashcards,
      });
      setInnerTab('notes');
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Unable to restructure note.');
    } finally {
      setResynthesizing(false);
    }
  }

  async function handleGenerateFlashcards() {
    if (!activeNote) return;
    setGeneratingCards(true);
    setWorkspaceError(null);
    try {
      const { flashcards } = await generateFlashcardsApi({
        title: activeNote.title,
        content: activeNote.content,
        transcript: activeNote.transcript,
        count: 8,
      });
      if (flashcards.length > 0) {
        await updateNoteFlashcards(activeNote.id, flashcards);
        setCardIndex(0);
        setCardFlipped(false);
      }
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Unable to generate flashcards.');
    } finally {
      setGeneratingCards(false);
    }
  }

  async function handleAddCustomCard(e: React.FormEvent) {
    e.preventDefault();
    if (!activeNote || !newCardFront.trim() || !newCardBack.trim()) return;
    const updated = [
      ...activeNote.flashcards,
      { front: newCardFront.trim(), back: newCardBack.trim() },
    ];
    await updateNoteFlashcards(activeNote.id, updated);
    setNewCardFront('');
    setNewCardBack('');
    setShowAddCard(false);
    setCardIndex(updated.length - 1);
    setCardFlipped(false);
  }

  async function handleListenSummary() {
    if (!activeNote) return;
    const textToRead =
      activeNote.summary ||
      activeNote.keyTakeaways.join('. ') ||
      activeNote.content.slice(0, 1200);
    if (!textToRead.trim()) {
      setWorkspaceError('This note does not have a summary to read aloud yet.');
      return;
    }
    setTtsLoading(true);
    setWorkspaceError(null);
    try {
      const { audioBase64, mimeType } = await synthesizeTtsApi({
        text: textToRead,
        voiceName: 'Kore',
      });
      const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
      const url = URL.createObjectURL(blob);
      setTtsAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Unable to generate audio summary.');
    } finally {
      setTtsLoading(false);
    }
  }

  async function handleAskSubmit(questionText: string) {
    if (!activeNote || !questionText.trim()) return;
    const q = questionText.trim();
    const nextHistory = [...qaMessages, { role: 'user' as const, text: q }];
    setQaMessages(nextHistory);
    setQaInput('');
    setQaLoading(true);
    setWorkspaceError(null);
    try {
      const { answer } = await askNoteApi({
        noteTitle: activeNote.title,
        noteContent: activeNote.content,
        transcript: activeNote.transcript,
        question: q,
        history: qaMessages,
      });
      setQaMessages([...nextHistory, { role: 'assistant', text: answer }]);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Unable to answer question right now.');
    } finally {
      setQaLoading(false);
    }
  }

  function handleExportMarkdown(note: Note) {
    const sections = [
      `# ${note.title}`,
      note.summary ? `\n## Summary\n${note.summary}` : '',
      note.keyTakeaways.length > 0
        ? `\n## Key Takeaways\n${note.keyTakeaways.map((t) => `- ${t}`).join('\n')}`
        : '',
      `\n${note.content}`,
      note.transcript ? `\n---\n\n## Verbatim Transcript\n\n${note.transcript}` : '',
    ].filter(Boolean);

    const blob = new Blob([sections.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || 'notevox-note'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAddSuggestedTask(index: number) {
    if (!recentSuggestedTasks) return;
    const item = recentSuggestedTasks.tasks[index];
    if (!item) return;
    await createTask({
      title: item.title,
      priority: item.priority,
      subjectId: recentSuggestedTasks.subjectId,
      noteId: recentSuggestedTasks.noteId,
    });
    setRecentSuggestedTasks((prev) =>
      prev ? { ...prev, added: { ...prev.added, [index]: true } } : null
    );
  }

  return (
    <div className="space-y-6">
      {/* Workspace Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-1 rounded-xl bg-[#F3EEE2] border border-[#E8E0D0]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'audio', label: 'Audio' },
                { id: 'document', label: 'Documents' },
                { id: 'manual', label: 'Manual' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  sourceFilter === tab.id
                    ? 'bg-white text-[#1C1926] shadow-xs'
                    : 'text-[#5C566C] hover:text-[#1C1926]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter notes by subject"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-white border border-[#E5DCCB] text-xs font-medium text-[#1C1926] focus:border-[#1C1926] focus:outline-none"
          >
            <option value="">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setShowUploadModal(true);
              setUploadError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C9B6F5] text-[#1C1926] text-xs font-semibold hover:bg-[#BAA4F0] transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileUp className="w-4 h-4" />
            Upload Material
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewNoteModal(true);
              setNewNoteError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F4A6C6] text-[#1C1926] text-xs font-semibold hover:bg-[#EE92B8] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Note
          </button>
        </div>
      </div>

      {/* Empty Library State */}
      {notes.length === 0 ? (
        <div className="nv-studio-card rounded-2xl overflow-hidden">
          <div className="h-1.5 w-full nv-spectrum-bar" aria-hidden="true" />
          <div className="p-8 sm:p-10">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center max-w-4xl mx-auto">
              <div className="md:col-span-5">
                <IllustrationFrame
                  src={NOTEVOX_ASSETS.heroStudio}
                  alt="Notevox studio desk ready for uploaded documents or recorded lectures"
                  fallbackType="notes"
                  className="aspect-[16/10] w-full"
                />
              </div>
            <div className="md:col-span-7 space-y-4">
              <h2 className="text-2xl font-bold text-[#1C1926]">
                Build your first AI-powered study note
              </h2>
              <p className="text-sm text-[#5C566C] leading-relaxed">
                Upload PDFs, Word docs, Markdown files, or photos of whiteboard slides — or jump into Lecture Studio to record audio with automatic speech-to-text transcription.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold hover:bg-[#312C42] cursor-pointer"
                >
                  <FileUp className="w-4 h-4 text-[#C9B6F5]" />
                  Upload Study Document
                </button>
                <button
                  type="button"
                  onClick={onGoToRecorder}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#62B8F5] text-[#1C1926] text-xs font-semibold hover:bg-[#4FA9EB] cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  Record Audio Lecture
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewNoteModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F7F2E7] border border-[#E5DCCB] text-[#1C1926] text-xs font-semibold hover:bg-[#EFE9DC] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Write or Paste Notes
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Notes List Rail */}
          <div
            className={`lg:col-span-4 nv-studio-card rounded-2xl overflow-hidden ${
              selectedNoteId ? 'hidden lg:block' : 'block'
            }`}
          >
            <div className="px-4 py-3 border-b border-[#F0E9DC] flex items-center justify-between text-xs text-[#5C566C]">
              <span className="font-semibold text-[#1C1926]">Notes Library</span>
              <span className="font-mono tabular-nums">
                {filteredNotes.length} shown
              </span>
            </div>

            {filteredNotes.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#5C566C]">
                No notes match the current filter.
              </div>
            ) : (
              <div className="divide-y divide-[#F0E9DC] max-h-[calc(100vh-260px)] overflow-y-auto">
                {filteredNotes.map((note) => {
                  const isSelected = activeNote?.id === note.id;
                  const subj = note.subjectId ? subjectMap.get(note.subjectId) : undefined;
                  const subjPalette = subj ? SUBJECT_PALETTE[subj.color] : null;
                  const sourceText =
                    note.sourceType === 'audio'
                      ? 'Audio'
                      : note.sourceType === 'document'
                        ? 'Document'
                        : 'Manual';

                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => onSelectNote(note.id)}
                      className={`w-full text-left p-4 transition-colors cursor-pointer ${
                        isSelected ? 'bg-[#FFF9E5]/80' : 'hover:bg-[#FFFDF8]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm text-[#1C1926] line-clamp-2">
                          {note.title}
                        </div>
                        {note.isPinned && (
                          <Pin className="w-3.5 h-3.5 text-[#8E2050] shrink-0 mt-0.5" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#5C566C] mt-1.5">
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
                        <span>{sourceText}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{note.wordCount}w</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatTimestampDate(note.updatedAt)}</span>
                      </div>
                      {note.summary && (
                        <p className="text-xs text-[#7B748C] line-clamp-2 mt-1.5 leading-relaxed">
                          {note.summary}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Active Note Canvas */}
          <div
            className={`lg:col-span-8 nv-studio-card rounded-2xl p-5 sm:p-7 space-y-5 ${
              selectedNoteId ? 'block' : 'hidden lg:block'
            }`}
          >
            {!activeNote ? (
              <div className="py-12 text-center text-sm text-[#5C566C]">
                Select a note from the list to read, edit, or study flashcards.
              </div>
            ) : (
              <>
                {/* Mobile Back to Notes List */}
                <button
                  type="button"
                  onClick={() => onSelectNote(null)}
                  className="lg:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-[#5C566C] hover:text-[#1C1926]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  All Notes
                </button>

                {/* Note Header */}
                <div className="space-y-3 pb-4 border-b border-[#F0E9DC]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          maxLength={160}
                          className="w-full text-xl sm:text-2xl font-bold text-[#1C1926] bg-[#FFFDF8] border border-[#E5DCCB] rounded-xl px-3 py-1.5 focus:border-[#1C1926] focus:outline-none"
                        />
                      ) : (
                        <h2 className="text-xl sm:text-2xl font-bold text-[#1C1926] tracking-tight">
                          {activeNote.title}
                        </h2>
                      )}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5C566C] mt-2">
                        <select
                          aria-label="Assign subject to note"
                          value={activeNote.subjectId}
                          onChange={(e) =>
                            void updateNote(activeNote.id, { subjectId: e.target.value })
                          }
                          className="bg-transparent font-semibold text-[#1C1926] hover:underline focus:outline-none cursor-pointer"
                        >
                          <option value="">No subject</option>
                          {subjects.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.name}
                            </option>
                          ))}
                        </select>
                        <span aria-hidden="true">·</span>
                        <span>
                          {activeNote.sourceType === 'audio'
                            ? 'Audio Lecture'
                            : activeNote.sourceType === 'document'
                              ? `Document (${activeNote.sourceFileName || 'upload'})`
                              : 'Manual Note'}
                        </span>
                        {activeNote.audioDurationSec > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {formatDurationHuman(activeNote.audioDurationSec)}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{activeNote.wordCount} words</span>
                        <span aria-hidden="true">·</span>
                        <span>{NOTE_STYLE_META[activeNote.noteStyle]?.label || 'Structured'}</span>
                      </div>
                    </div>

                    {/* Toolbar Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      {!isEditing ? (
                        <button
                          type="button"
                          onClick={() => enterEditMode(activeNote)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F7F2E7] text-xs font-semibold text-[#1C1926] hover:bg-[#EFE9DC] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveEditedNote()}
                            disabled={savingEdit}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#83D66F] text-xs font-semibold text-[#1C1926] hover:bg-[#73C75E] cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {savingEdit ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="px-3 py-2 rounded-xl border border-[#E5DCCB] text-xs font-medium text-[#5C566C] hover:bg-[#F7F2E7] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleListenSummary()}
                        disabled={ttsLoading}
                        title="Listen to spoken audio summary"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#EEF7FE] text-xs font-semibold text-[#145585] hover:bg-[#DCEFFC] cursor-pointer disabled:opacity-60"
                      >
                        {ttsLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                        <span>{ttsLoading ? 'Generating...' : 'Listen'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportMarkdown(activeNote)}
                        title="Download note as Markdown"
                        className="p-2 rounded-xl border border-[#E8E0D0] text-[#5C566C] hover:text-[#1C1926] hover:bg-[#F7F2E7] cursor-pointer"
                        aria-label="Export note as Markdown"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void togglePinNote(activeNote.id, activeNote.isPinned)}
                        title={activeNote.isPinned ? 'Unpin note' : 'Pin note to top'}
                        className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                          activeNote.isPinned
                            ? 'bg-[#FDF2F7] border-[#F2C6D8] text-[#8E2050]'
                            : 'border-[#E8E0D0] text-[#5C566C] hover:text-[#1C1926] hover:bg-[#F7F2E7]'
                        }`}
                        aria-label={activeNote.isPinned ? 'Unpin note' : 'Pin note'}
                      >
                        <Pin className="w-4 h-4" />
                      </button>

                      {confirmDeleteId === activeNote.id ? (
                        <div className="inline-flex items-center gap-1.5 pl-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const idToDelete = activeNote.id;
                              setConfirmDeleteId(null);
                              onSelectNote(null);
                              await deleteNote(idToDelete);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#A62448] text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 text-xs text-[#5C566C] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(activeNote.id)}
                          className="p-2 rounded-xl border border-[#E8E0D0] text-[#5C566C] hover:text-[#A62448] hover:border-[#F2C6D8] cursor-pointer"
                          aria-label="Delete note"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Audio Summary Playback Bar (when generated) */}
                  {ttsAudioUrl && (
                    <div className="p-3 rounded-xl bg-[#EEF7FE] border border-[#B4DCFA] flex flex-wrap items-center gap-3">
                      <span className="text-xs font-semibold text-[#145585]">Spoken Summary</span>
                      <audio controls autoPlay src={ttsAudioUrl} className="flex-1 h-9 min-w-[200px]" />
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(ttsAudioUrl);
                          setTtsAudioUrl(null);
                        }}
                        aria-label="Close audio player"
                        className="p-1 text-[#145585] hover:opacity-75"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Newly Extracted Suggested Study Tasks Banner */}
                  {recentSuggestedTasks && recentSuggestedTasks.noteId === activeNote.id && (
                    <div className="p-4 rounded-xl bg-[#FFF9E5] border border-[#F5DF98] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#7A5200]">
                          AI Suggested Study Tasks from this Material
                        </span>
                        <button
                          type="button"
                          onClick={() => setRecentSuggestedTasks(null)}
                          className="text-xs text-[#7A5200] hover:underline"
                        >
                          Dismiss
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {recentSuggestedTasks.tasks.map((task, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 bg-white border border-[#F5DF98] rounded-lg px-3 py-2 text-xs"
                          >
                            <span className="text-[#1C1926] font-medium truncate">{task.title}</span>
                            <button
                              type="button"
                              disabled={recentSuggestedTasks.added[idx]}
                              onClick={() => void handleAddSuggestedTask(idx)}
                              className="px-2.5 py-1 rounded-md bg-[#FFD45C] text-[#1C1926] font-semibold disabled:bg-[#F0FAED] disabled:text-[#226119] whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {recentSuggestedTasks.added[idx] ? 'Added' : '+ Add'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Inner Workspace Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center p-1 rounded-xl bg-[#F3EEE2] border border-[#E8E0D0]">
                    <button
                      type="button"
                      onClick={() => setInnerTab('notes')}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        innerTab === 'notes'
                          ? 'bg-white text-[#1C1926] shadow-xs'
                          : 'text-[#5C566C] hover:text-[#1C1926]'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Study Notes
                    </button>

                    {activeNote.transcript && (
                      <button
                        type="button"
                        onClick={() => setInnerTab('transcript')}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          innerTab === 'transcript'
                            ? 'bg-white text-[#1C1926] shadow-xs'
                            : 'text-[#5C566C] hover:text-[#1C1926]'
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        Transcript
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setInnerTab('flashcards')}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        innerTab === 'flashcards'
                          ? 'bg-white text-[#1C1926] shadow-xs'
                          : 'text-[#5C566C] hover:text-[#1C1926]'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Flashcards ({activeNote.flashcards.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => setInnerTab('ask')}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        innerTab === 'ask'
                          ? 'bg-white text-[#1C1926] shadow-xs'
                          : 'text-[#5C566C] hover:text-[#1C1926]'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Ask Note
                    </button>
                  </div>

                  {/* Quick AI Restructure Style Switcher */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={resynthesizing}
                      onClick={() =>
                        void handleResynthesize(
                          activeNote.noteStyle === 'cornell' ? 'revision' : 'cornell'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FDF2F7] text-[#8E2050] text-xs font-semibold hover:bg-[#FAE2EE] transition-colors whitespace-nowrap disabled:opacity-60 cursor-pointer"
                    >
                      {resynthesizing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {resynthesizing
                          ? 'Structuring...'
                          : activeNote.noteStyle === 'cornell'
                            ? 'Convert to Exam Revision'
                            : 'Convert to Cornell Notes'}
                      </span>
                    </button>
                  </div>
                </div>

                {workspaceError && (
                  <div className="p-3.5 rounded-xl bg-[#FDF2F7] border border-[#F2C6D8] flex items-start gap-2.5 text-xs text-[#8E2050]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{workspaceError}</span>
                  </div>
                )}

                {/* TAB 1: STUDY NOTES */}
                {innerTab === 'notes' && (
                  <div className="space-y-6">
                    {isEditing ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-[#5C566C] mb-1.5">
                            Executive Summary
                          </label>
                          <textarea
                            rows={3}
                            value={editSummary}
                            onChange={(e) => setEditSummary(e.target.value)}
                            placeholder="Brief 2-3 sentence overview..."
                            className="w-full p-3.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm text-[#1C1926] focus:border-[#1C1926] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#5C566C] mb-1.5">
                            Study Notes (Markdown supported)
                          </label>
                          <textarea
                            rows={16}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            placeholder="Write or refine your notes using Markdown headings, lists, and bold terms..."
                            className="w-full p-4 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm font-mono text-[#1C1926] leading-relaxed focus:border-[#1C1926] focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        {activeNote.summary && (
                          <div className="p-4 sm:p-5 rounded-xl bg-[#F8F4EA] border border-[#EAE3D5]">
                            <div className="text-xs font-semibold text-[#5C566C] mb-1.5">
                              Overview
                            </div>
                            <p className="text-sm text-[#1C1926] leading-relaxed">
                              {activeNote.summary}
                            </p>
                          </div>
                        )}

                        {activeNote.keyTakeaways.length > 0 && (
                          <div className="space-y-2.5">
                            <div className="text-xs font-semibold text-[#5C566C]">
                              Key Takeaways
                            </div>
                            <ul className="space-y-2">
                              {activeNote.keyTakeaways.map((point, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-2.5 text-sm text-[#1C1926] leading-relaxed"
                                >
                                  <span className="font-mono text-xs font-semibold text-[#8E2050] mt-0.5 tabular-nums shrink-0">
                                    {String(idx + 1).padStart(2, '0')}.
                                  </span>
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="pt-2 border-t border-[#F0E9DC]">
                          {activeNote.content ? (
                            <div className="nv-prose">
                              <Markdown remarkPlugins={[remarkGfm]}>{activeNote.content}</Markdown>
                            </div>
                          ) : (
                            <p className="text-sm text-[#5C566C]">
                              No note content yet. Click Edit to begin writing.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* TAB 2: VERBATIM TRANSCRIPT */}
                {innerTab === 'transcript' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-[#5C566C]">
                        Verbatim text converted from your source audio or document.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(activeNote.transcript);
                            setCopiedTranscript(true);
                            window.setTimeout(() => setCopiedTranscript(false), 1800);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7F2E7] text-xs font-semibold text-[#1C1926] hover:bg-[#EFE9DC] cursor-pointer"
                        >
                          {copiedTranscript ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedTranscript ? 'Copied' : 'Copy Text'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={resynthesizing}
                          onClick={() => void handleResynthesize(activeNote.noteStyle)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold hover:bg-[#312C42] disabled:opacity-60 cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${resynthesizing ? 'animate-spin' : ''}`} />
                          Re-generate Study Notes
                        </button>
                      </div>
                    </div>
                    <div className="p-5 rounded-xl bg-[#FFFDF8] border border-[#EAE3D5] text-sm text-[#2A2638] leading-relaxed whitespace-pre-wrap max-h-[540px] overflow-y-auto">
                      {activeNote.transcript}
                    </div>
                  </div>
                )}

                {/* TAB 3: ACTIVE-RECALL FLASHCARDS */}
                {innerTab === 'flashcards' && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-[#5C566C]">
                        Click the card to flip between question and answer.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddCard((prev) => !prev)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F7F2E7] border border-[#E5DCCB] text-xs font-semibold text-[#1C1926] hover:bg-[#EFE9DC] cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Card
                        </button>
                        <button
                          type="button"
                          disabled={generatingCards}
                          onClick={() => void handleGenerateFlashcards()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#FFD45C] text-[#1C1926] text-xs font-semibold hover:bg-[#F5C642] disabled:opacity-60 cursor-pointer"
                        >
                          {generatingCards ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {generatingCards
                              ? 'Generating...'
                              : activeNote.flashcards.length > 0
                                ? 'Refresh Deck with AI'
                                : 'Generate Flashcards with AI'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {showAddCard && (
                      <form
                        onSubmit={handleAddCustomCard}
                        className="p-4 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] space-y-3"
                      >
                        <input
                          type="text"
                          required
                          value={newCardFront}
                          onChange={(e) => setNewCardFront(e.target.value)}
                          placeholder="Front — Question or key term"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#E5DCCB] text-sm"
                        />
                        <textarea
                          rows={2}
                          required
                          value={newCardBack}
                          onChange={(e) => setNewCardBack(e.target.value)}
                          placeholder="Back — Concise answer"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#E5DCCB] text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAddCard(false)}
                            className="px-3 py-1.5 text-xs text-[#5C566C]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-lg bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold"
                          >
                            Save Card
                          </button>
                        </div>
                      </form>
                    )}

                    {activeNote.flashcards.length === 0 ? (
                      <div className="p-10 rounded-2xl bg-[#FFFDF8] border border-[#EAE3D5] text-center space-y-3">
                        <HelpCircle className="w-8 h-8 text-[#7A5200] mx-auto" />
                        <div className="text-base font-bold text-[#1C1926]">
                          No flashcards in this deck yet
                        </div>
                        <p className="text-xs text-[#5C566C] max-w-sm mx-auto">
                          Generate active-recall cards from your study notes or lecture transcript in one click.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {/* Deck Progress Bar */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 rounded-full bg-[#F3EEE2] overflow-hidden">
                            <div
                              className="h-full rounded-full nv-spectrum-bar transition-all duration-300"
                              style={{
                                width: `${Math.round(
                                  ((cardIndex + 1) / activeNote.flashcards.length) * 100
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono font-bold tabular-nums text-[#5C566C]">
                            {cardIndex + 1} / {activeNote.flashcards.length}
                          </span>
                        </div>

                        {/* Stacked 3D Spring-Flip Flashcard Stage */}
                        <div className="relative py-2">
                          {/* Tactile Deck Backing Cards */}
                          {activeNote.flashcards.length > 1 && (
                            <>
                              <div
                                aria-hidden="true"
                                className="absolute inset-x-4 top-4 bottom-0 rounded-2xl bg-[#EEF7FE] border border-[#62B8F5]/50 rotate-[1.4deg]"
                              />
                              <div
                                aria-hidden="true"
                                className="absolute inset-x-2 top-3 bottom-1 rounded-2xl bg-[#F5F1FE] border border-[#C9B6F5]/60 -rotate-[1deg]"
                              />
                            </>
                          )}

                          <div style={{ perspective: 1200 }} className="relative">
                            <motion.div
                              role="button"
                              tabIndex={0}
                              aria-label={
                                cardFlipped
                                  ? 'Flashcard answer shown. Press to flip back to question.'
                                  : 'Flashcard question shown. Press to reveal answer.'
                              }
                              onClick={() => setCardFlipped((prev) => !prev)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setCardFlipped((prev) => !prev);
                                }
                              }}
                              animate={{ rotateY: cardFlipped ? 180 : 0 }}
                              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                              style={{ transformStyle: 'preserve-3d' }}
                              className="relative w-full min-h-[250px] cursor-pointer select-none"
                            >
                              {/* Front Face — Question (Sunshine Yellow Studio Face) */}
                              <div
                                style={{ backfaceVisibility: 'hidden' }}
                                className="absolute inset-0 rounded-2xl bg-[#FFF9E5] border-2 border-[#1C1926] overflow-hidden flex flex-col justify-between shadow-sm"
                              >
                                <div className="h-2 w-full bg-[#FFD45C]" aria-hidden="true" />
                                <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between">
                                  <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-[#7A5200]">
                                    <span>Question · Tap to reveal</span>
                                    <span className="tabular-nums">
                                      CARD #{String(cardIndex + 1).padStart(2, '0')}
                                    </span>
                                  </div>
                                  <div className="text-lg sm:text-2xl font-bold text-[#1C1926] leading-snug my-4">
                                    {activeNote.flashcards[cardIndex]?.front}
                                  </div>
                                  <div className="text-xs font-medium text-[#7A5200]">
                                    Recall the concept out loud before flipping
                                  </div>
                                </div>
                              </div>

                              {/* Back Face — Answer (Meadow Green Studio Face) */}
                              <div
                                style={{
                                  backfaceVisibility: 'hidden',
                                  transform: 'rotateY(180deg)',
                                }}
                                className="absolute inset-0 rounded-2xl bg-[#F0FAED] border-2 border-[#1C1926] overflow-hidden flex flex-col justify-between shadow-sm"
                              >
                                <div className="h-2 w-full bg-[#83D66F]" aria-hidden="true" />
                                <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between">
                                  <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-[#226119]">
                                    <span>Answer · Active Recall</span>
                                    <span className="tabular-nums">
                                      CARD #{String(cardIndex + 1).padStart(2, '0')}
                                    </span>
                                  </div>
                                  <div className="text-base sm:text-xl font-bold text-[#1C1926] leading-relaxed my-4 overflow-y-auto">
                                    {activeNote.flashcards[cardIndex]?.back}
                                  </div>
                                  <div className="text-xs font-medium text-[#226119]">
                                    Tap to return to question
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setCardFlipped(false);
                              setCardIndex((prev) =>
                                prev === 0 ? activeNote.flashcards.length - 1 : prev - 1
                              );
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F7F2E7] border border-[#E5DCCB] text-xs font-semibold text-[#1C1926] hover:bg-[#EFE9DC] cursor-pointer"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Previous
                          </button>

                          <button
                            type="button"
                            onClick={() => setCardFlipped((prev) => !prev)}
                            className="px-5 py-2.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs font-bold hover:bg-[#312C42] cursor-pointer"
                          >
                            {cardFlipped ? 'Show Question' : 'Flip Card'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setCardFlipped(false);
                              setCardIndex((prev) => (prev + 1) % activeNote.flashcards.length);
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F7F2E7] border border-[#E5DCCB] text-xs font-semibold text-[#1C1926] hover:bg-[#EFE9DC] cursor-pointer"
                          >
                            Next
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: ASK YOUR NOTE */}
                {innerTab === 'ask' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        'Explain the toughest concept simply',
                        'Quiz me with 3 short exam questions',
                        'Give me a 60-second revision recap',
                      ].map((starter) => (
                        <button
                          key={starter}
                          type="button"
                          disabled={qaLoading}
                          onClick={() => void handleAskSubmit(starter)}
                          className="px-3 py-1.5 rounded-xl bg-[#F7F2E7] border border-[#E5DCCB] text-xs font-medium text-[#1C1926] hover:bg-[#EFE9DC] cursor-pointer"
                        >
                          {starter}
                        </button>
                      ))}
                    </div>

                    <div className="rounded-2xl bg-[#FFFDF8] border border-[#EAE3D5] p-4 min-h-[240px] max-h-[420px] overflow-y-auto space-y-4">
                      {qaMessages.length === 0 ? (
                        <div className="py-12 text-center text-xs text-[#5C566C]">
                          Ask any study question about &ldquo;{activeNote.title}&rdquo;. Answers stay grounded in this note and transcript.
                        </div>
                      ) : (
                        qaMessages.map((msg, i) => (
                          <div
                            key={i}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                msg.role === 'user'
                                  ? 'bg-[#1C1926] text-[#FFFDF8]'
                                  : 'bg-white border border-[#EAE3D5] text-[#1C1926] nv-prose'
                              }`}
                            >
                              {msg.role === 'assistant' ? (
                                <Markdown remarkPlugins={[remarkGfm]}>{msg.text}</Markdown>
                              ) : (
                                msg.text
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      {qaLoading && (
                        <div className="inline-flex items-center gap-2 text-xs text-[#5C566C]">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Thinking over your note...
                        </div>
                      )}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleAskSubmit(qaInput);
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={qaInput}
                        onChange={(e) => setQaInput(e.target.value)}
                        placeholder="Ask a question about this note..."
                        className="flex-1 h-11 px-4 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm text-[#1C1926] focus:border-[#1C1926] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={qaLoading || !qaInput.trim()}
                        className="h-11 px-4 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold hover:bg-[#312C42] disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Ask
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: UPLOAD STUDY MATERIAL */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 bg-[#1C1926]/40 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-doc-title"
        >
          <div className="bg-white border border-[#E8E0D0] rounded-2xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 id="upload-doc-title" className="text-xl font-bold text-[#1C1926]">
                  Upload Study Material
                </h2>
                <p className="text-xs text-[#5C566C] mt-0.5">
                  PDF, Word (.docx), TXT, Markdown, CSV, or photos of slides & whiteboards
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="p-2 rounded-lg text-[#5C566C] hover:bg-[#F3EEE2]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProcessDocument} className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) setUploadFile(f);
                }}
                className="rounded-xl bg-[#FFFDF8] border-2 border-dashed border-[#D8CEBB] hover:border-[#C9B6F5] p-6 text-center space-y-2.5 transition-colors"
              >
                <input
                  ref={docInputRef}
                  id="doc-file-input"
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <FileUp className="w-7 h-7 text-[#4D3290] mx-auto" />
                {uploadFile ? (
                  <div>
                    <div className="text-sm font-semibold text-[#1C1926]">{uploadFile.name}</div>
                    <div className="text-xs text-[#5C566C] tabular-nums mt-0.5">
                      {(uploadFile.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#5C566C]">
                    Drag & drop your file here, or click browse (up to 20MB)
                  </div>
                )}
                <label
                  htmlFor="doc-file-input"
                  className="inline-block px-4 py-2 rounded-xl bg-[#C9B6F5] text-[#1C1926] text-xs font-semibold hover:bg-[#BAA4F0] cursor-pointer"
                >
                  {uploadFile ? 'Change File' : 'Choose Study File'}
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                    Subject
                  </label>
                  <select
                    value={uploadSubjectId}
                    onChange={(e) => setUploadSubjectId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
                  >
                    <option value="">General / Unassigned</option>
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                    AI Note Format
                  </label>
                  <select
                    value={uploadStyle}
                    onChange={(e) => setUploadStyle(e.target.value as NoteStyle)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
                  >
                    {(Object.keys(NOTE_STYLE_META) as NoteStyle[]).map((k) => (
                      <option key={k} value={k}>
                        {NOTE_STYLE_META[k].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                  Focus Instructions (optional)
                </label>
                <input
                  type="text"
                  value={uploadInstructions}
                  onChange={(e) => setUploadInstructions(e.target.value)}
                  placeholder="e.g., Highlight key definitions and formulas for midterm prep"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
                />
              </div>

              {uploadError && (
                <div className="p-3 rounded-xl bg-[#FDF2F7] border border-[#F2C6D8] text-xs text-[#8E2050]">
                  {uploadError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5DCCB] text-xs font-semibold text-[#5C566C] hover:bg-[#F7F2E7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || uploadingDoc}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold hover:bg-[#312C42] disabled:opacity-50 cursor-pointer"
                >
                  {uploadingDoc ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#C9B6F5]" />
                      Analyzing with Gemini...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 text-[#FFD45C]" />
                      Generate AI Study Kit
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NEW MANUAL OR PASTE-TO-AI NOTE */}
      {showNewNoteModal && (
        <div
          className="fixed inset-0 z-50 bg-[#1C1926]/40 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-note-title"
        >
          <div className="bg-white border border-[#E8E0D0] rounded-2xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 id="new-note-title" className="text-xl font-bold text-[#1C1926]">
                Create Smart Note
              </h2>
              <button
                type="button"
                onClick={() => setShowNewNoteModal(false)}
                className="p-2 rounded-lg text-[#5C566C] hover:bg-[#F3EEE2]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="inline-flex items-center p-1 rounded-xl bg-[#F3EEE2] border border-[#E8E0D0] mb-4">
              <button
                type="button"
                onClick={() => setNewMode('ai')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  newMode === 'ai' ? 'bg-white text-[#1C1926]' : 'text-[#5C566C]'
                }`}
              >
                Structure Rough Text with AI
              </button>
              <button
                type="button"
                onClick={() => setNewMode('blank')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  newMode === 'blank' ? 'bg-white text-[#1C1926]' : 'text-[#5C566C]'
                }`}
              >
                Write Manual Note
              </button>
            </div>

            <form onSubmit={handleCreateNewNote} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                  Title {newMode === 'ai' ? '(optional — AI can suggest one)' : ''}
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Microeconomics Chapter 4 — Elasticity"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                    Subject
                  </label>
                  <select
                    value={newSubjectId}
                    onChange={(e) => setNewSubjectId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
                  >
                    <option value="">General / Unassigned</option>
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                {newMode === 'ai' && (
                  <div>
                    <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                      Format
                    </label>
                    <select
                      value={newStyle}
                      onChange={(e) => setNewStyle(e.target.value as NoteStyle)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
                    >
                      {(Object.keys(NOTE_STYLE_META) as NoteStyle[]).map((k) => (
                        <option key={k} value={k}>
                          {NOTE_STYLE_META[k].label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                  {newMode === 'ai' ? 'Paste raw class notes, readings, or outline' : 'Note Content'}
                </label>
                <textarea
                  rows={7}
                  value={newRawText}
                  onChange={(e) => setNewRawText(e.target.value)}
                  placeholder={
                    newMode === 'ai'
                      ? 'Paste rough lecture notes, syllabus passages, or textbook excerpts here...'
                      : 'Start writing your study notes...'
                  }
                  className="w-full p-3.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm leading-relaxed"
                />
              </div>

              {newNoteError && (
                <div className="p-3 rounded-xl bg-[#FDF2F7] border border-[#F2C6D8] text-xs text-[#8E2050]">
                  {newNoteError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewNoteModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5DCCB] text-xs font-semibold text-[#5C566C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingNote}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold hover:bg-[#312C42] disabled:opacity-60 cursor-pointer"
                >
                  {creatingNote ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#F4A6C6]" />
                      {newMode === 'ai' ? 'Structuring with AI...' : 'Saving...'}
                    </>
                  ) : newMode === 'ai' ? (
                    <>
                      <Wand2 className="w-4 h-4 text-[#F4A6C6]" />
                      Structure & Save
                    </>
                  ) : (
                    'Create Note'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
