import React, { useState } from 'react';
import { ArrowRight, Edit3, FolderPlus, Plus, Trash2, X } from 'lucide-react';
import { useNotevox } from '../context/NotevoxContext';
import { SUBJECT_COLOR_LIST, SUBJECT_PALETTE } from '../lib/palette';
import { BLUEPRINT_LIMITS, type Subject, type SubjectColor } from '../types';

interface SubjectsViewProps {
  onOpenSubjectNotes: (subjectId: string) => void;
}

export function SubjectsView({ onOpenSubjectNotes }: SubjectsViewProps) {
  const { subjects, notes, tasks, createSubject, updateSubject, deleteSubject } = useNotevox();

  const [showForm, setShowForm] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState<SubjectColor>('sky');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function openCreate() {
    setEditingSubject(null);
    setName('');
    setCode('');
    setColor(SUBJECT_COLOR_LIST[subjects.length % SUBJECT_COLOR_LIST.length].key);
    setDescription('');
    setError(null);
    setShowForm(true);
  }

  function openEdit(subject: Subject) {
    setEditingSubject(subject);
    setName(subject.name);
    setCode(subject.code);
    setColor(subject.color);
    setDescription(subject.description);
    setError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a subject name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingSubject) {
        await updateSubject(editingSubject.id, {
          name: name.trim(),
          code: code.trim(),
          color,
          description: description.trim(),
        });
      } else {
        await createSubject({
          name: name.trim(),
          code: code.trim(),
          color,
          description: description.trim(),
        });
      }
      setShowForm(false);
      setEditingSubject(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save subject.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1C1926]">Your Subjects</h2>
          <p className="text-xs text-[#5C566C] mt-0.5">
            Organize lecture transcripts, uploaded documents, and study tasks by course.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFD45C] text-[#1C1926] text-xs font-semibold hover:bg-[#F5C642] transition-colors whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Subject
        </button>
      </div>

      {subjects.length === 0 ? (
        <div className="nv-studio-card rounded-2xl overflow-hidden">
          <div className="h-1.5 w-full nv-spectrum-bar" aria-hidden="true" />
          <div className="p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#F5F1FE] text-[#4D3290] mx-auto flex items-center justify-center">
              <FolderPlus className="w-7 h-7" />
            </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-lg font-bold text-[#1C1926]">No subjects created yet</h3>
            <p className="text-sm text-[#5C566C] leading-relaxed">
              Add the courses you&apos;re taking this term — like Biology, Calculus, or Art History — and give each one a signature Notevox color.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold hover:bg-[#312C42] cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#FFD45C]" />
            Create Your First Subject
          </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {subjects.map((subject) => {
            const palette = SUBJECT_PALETTE[subject.color] || SUBJECT_PALETTE.sky;
            const noteCount = notes.filter((n) => n.subjectId === subject.id).length;
            const audioCount = notes.filter(
              (n) => n.subjectId === subject.id && n.sourceType === 'audio'
            ).length;
            const openTasks = tasks.filter(
              (t) => t.subjectId === subject.id && !t.completed
            ).length;

            return (
              <article
                key={subject.id}
                className="nv-studio-card nv-studio-card-interactive rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className={`h-1.5 w-full ${palette.swatchClass}`} aria-hidden="true" />
                  <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-bold text-sm text-[#1C1926] ${palette.swatchClass}`}
                      >
                        {subject.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-[#1C1926] truncate">
                          {subject.name}
                        </h3>
                        <p className="text-xs text-[#5C566C] truncate">
                          {subject.code || palette.label}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(subject)}
                        className="p-1.5 rounded-lg text-[#5C566C] hover:bg-[#F3EEE2] hover:text-[#1C1926] cursor-pointer"
                        aria-label={`Edit ${subject.name}`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(subject.id)}
                        className="p-1.5 rounded-lg text-[#5C566C] hover:bg-[#FDF2F7] hover:text-[#A62448] cursor-pointer"
                        aria-label={`Delete ${subject.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {subject.description && (
                    <p className="text-xs text-[#5C566C] leading-relaxed line-clamp-2">
                      {subject.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#5C566C] pt-1 tabular-nums">
                    <span>
                      <strong className="text-[#1C1926]">{noteCount}</strong>{' '}
                      {noteCount === 1 ? 'note' : 'notes'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      <strong className="text-[#1C1926]">{audioCount}</strong>{' '}
                      {audioCount === 1 ? 'lecture' : 'lectures'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      <strong className="text-[#1C1926]">{openTasks}</strong> open{' '}
                      {openTasks === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                  </div>
                </div>

                <div className="px-5 pb-5">
                  {confirmDeleteId === subject.id ? (
                    <div className="pt-3 border-t border-[#F0E9DC] flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#8E2050] font-medium">Delete subject?</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 text-[#5C566C] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setConfirmDeleteId(null);
                            await deleteSubject(subject.id);
                          }}
                          className="px-3 py-1 rounded-lg bg-[#A62448] text-white font-semibold cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-[#F0E9DC]">
                      <button
                        type="button"
                        onClick={() => onOpenSubjectNotes(subject.id)}
                        className="w-full inline-flex items-center justify-between text-xs font-semibold text-[#1C1926] hover:text-[#4D3290] transition-colors cursor-pointer"
                      >
                        <span>Open Subject Notes</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Subject Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 bg-[#1C1926]/40 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subject-modal-title"
        >
          <div className="bg-white border border-[#E8E0D0] rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 id="subject-modal-title" className="text-xl font-bold text-[#1C1926]">
                {editingSubject ? 'Edit Subject' : 'New Subject'}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="p-2 rounded-lg text-[#5C566C] hover:bg-[#F3EEE2]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                  Subject Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.SUBJECT_NAME_MAX}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Organic Chemistry"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                  Course Code (optional)
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.SUBJECT_CODE_MAX}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g., CHEM-204"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-[#1C1926] mb-2">
                  Color Theme
                </span>
                <div className="flex items-center gap-2.5">
                  {SUBJECT_COLOR_LIST.map((token) => (
                    <button
                      key={token.key}
                      type="button"
                      onClick={() => setColor(token.key)}
                      aria-label={token.label}
                      title={token.label}
                      className={`w-10 h-10 rounded-xl ${token.swatchClass} transition-transform cursor-pointer ${
                        color === token.key
                          ? 'ring-2 ring-[#1C1926] ring-offset-2 scale-105'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                  Notes / Syllabus Focus (optional)
                </label>
                <textarea
                  rows={3}
                  maxLength={BLUEPRINT_LIMITS.SUBJECT_DESC_MAX}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Professor, exam dates, or lab schedule..."
                  className="w-full p-3 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-[#FDF2F7] border border-[#F2C6D8] text-xs text-[#8E2050]">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5DCCB] text-xs font-semibold text-[#5C566C]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold hover:bg-[#312C42] disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Saving...' : editingSubject ? 'Save Changes' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
