import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { countWords, getTodayDateKey, timestampToMillis } from '../lib/palette';
import {
  BLUEPRINT_LIMITS,
  type ActivityType,
  type BillingCycle,
  type BillingRecord,
  type CurrencyCode,
  type Flashcard,
  type GatewayMode,
  type Note,
  type NoteStyle,
  type PaymentMethodId,
  type PlanId,
  type SourceType,
  type StudyActivity,
  type StudyTask,
  type Subject,
  type SubjectColor,
  type TaskPriority,
  type UserProfile,
} from '../types';

function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampString(val: string, maxLen: number): string {
  return (val || '').trim().slice(0, maxLen);
}

function sanitizeOptionalId(id?: string): string {
  const cleaned = (id || '').trim();
  if (!cleaned) return '';
  return BLUEPRINT_LIMITS.ID_PATTERN.test(cleaned) ? cleaned.slice(0, 128) : '';
}

function sanitizeTakeaways(items: string[]): string[] {
  return (items || [])
    .map((item) => clampString(item, BLUEPRINT_LIMITS.TAKEAWAY_ITEM_MAX))
    .filter((item) => item.length > 0)
    .slice(0, BLUEPRINT_LIMITS.TAKEAWAYS_MAX_COUNT);
}

function sanitizeFlashcards(cards: Flashcard[]): Flashcard[] {
  return (cards || [])
    .map((card) => ({
      front: clampString(card.front, BLUEPRINT_LIMITS.FLASHCARD_FRONT_MAX),
      back: clampString(card.back, BLUEPRINT_LIMITS.FLASHCARD_BACK_MAX),
    }))
    .filter((card) => card.front.length > 0 && card.back.length > 0)
    .slice(0, BLUEPRINT_LIMITS.FLASHCARDS_MAX_COUNT);
}

interface NotevoxContextValue {
  user: User | null;
  authLoading: boolean;
  dataReady: boolean;
  authError: string | null;
  profile: UserProfile | null;
  subjects: Subject[];
  notes: Note[];
  tasks: StudyTask[];
  activities: StudyActivity[];
  billingRecords: BillingRecord[];
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  updateProfile: (updates: {
    displayName: string;
    majorOrGrade: string;
    dailyGoalMinutes: number;
  }) => Promise<void>;
  createSubject: (input: {
    name: string;
    code: string;
    color: SubjectColor;
    description: string;
  }) => Promise<string>;
  updateSubject: (
    subjectId: string,
    updates: {
      name: string;
      code: string;
      color: SubjectColor;
      description: string;
    }
  ) => Promise<void>;
  deleteSubject: (subjectId: string) => Promise<void>;
  createNote: (input: {
    title: string;
    subjectId?: string;
    sourceType: SourceType;
    noteStyle?: NoteStyle;
    sourceFileName?: string;
    audioDurationSec?: number;
    summary?: string;
    content?: string;
    transcript?: string;
    keyTakeaways?: string[];
    flashcards?: Flashcard[];
  }) => Promise<string>;
  updateNote: (
    noteId: string,
    updates: {
      title?: string;
      subjectId?: string;
      noteStyle?: NoteStyle;
      summary?: string;
      content?: string;
      transcript?: string;
      keyTakeaways?: string[];
      flashcards?: Flashcard[];
    }
  ) => Promise<void>;
  togglePinNote: (noteId: string, currentPinned: boolean) => Promise<void>;
  updateNoteFlashcards: (noteId: string, flashcards: Flashcard[]) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  createTask: (input: {
    title: string;
    details?: string;
    subjectId?: string;
    noteId?: string;
    dueDate?: string;
    priority?: TaskPriority;
    reminderEnabled?: boolean;
  }) => Promise<string>;
  toggleTaskCompleted: (task: StudyTask) => Promise<void>;
  toggleTaskReminder: (task: StudyTask) => Promise<void>;
  updateTask: (
    taskId: string,
    updates: {
      title: string;
      details: string;
      subjectId: string;
      noteId: string;
      dueDate: string;
      priority: TaskPriority;
      reminderEnabled: boolean;
    }
  ) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  logStudyActivity: (input: {
    type: ActivityType;
    label: string;
    subjectId?: string;
    durationMinutes?: number;
  }) => Promise<void>;
  recordBillingCheckout: (receipt: {
    receiptId: string;
    planId: PlanId;
    billingCycle: BillingCycle;
    paymentMethod: PaymentMethodId;
    paymentMethodLabel: string;
    amountCents: number;
    currency: CurrencyCode;
    promoCode: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    gatewayMode: GatewayMode;
    status: 'completed';
  }) => Promise<void>;
}

const NotevoxContext = createContext<NotevoxContextValue | null>(null);

export function NotevoxProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [activities, setActivities] = useState<StudyActivity[]>([]);
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (!firebaseUser) {
        setProfile(null);
        setSubjects([]);
        setNotes([]);
        setTasks([]);
        setActivities([]);
        setBillingRecords([]);
        setDataReady(false);
      }
    });
    return () => unsub();
  }, []);

  // Ensure root profile document exists (Master Gate) before attaching subcollection listeners
  useEffect(() => {
    if (!user) return;
    let active = true;
    const unsubscribers: (() => void)[] = [];

    async function bootstrapUserWorkspace(uid: string, displayNameRaw: string | null) {
      const profilePath = `users/${uid}`;
      const profileRef = doc(db, 'users', uid);

      try {
        const snap = await getDoc(profileRef);
        if (!snap.exists()) {
          const initialName = clampString(
            displayNameRaw || 'Student',
            BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
          ) || 'Student';
          await setDoc(profileRef, {
            ownerId: uid,
            displayName: initialName,
            majorOrGrade: '',
            dailyGoalMinutes: 60,
            planId: 'starter',
            billingCycle: 'monthly',
            paymentMethod: 'Free Tier',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        if (!active) return;
        handleFirestoreError(err, OperationType.WRITE, profilePath);
      }

      if (!active) return;

      // Subscribe to root profile
      unsubscribers.push(
        onSnapshot(
          profileRef,
          (snap) => {
            if (snap.exists()) {
              setProfile(snap.data() as UserProfile);
            }
            setDataReady(true);
          },
          (err) => handleFirestoreError(err, OperationType.GET, profilePath)
        )
      );

      // Subjects listener (secure query matching allow list ownerId check)
      const subjectsPath = `users/${uid}/subjects`;
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'users', uid, 'subjects'), where('ownerId', '==', uid)),
          (snap) => {
            const list: Subject[] = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Subject, 'id'>),
            }));
            list.sort((a, b) => a.name.localeCompare(b.name));
            setSubjects(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, subjectsPath)
        )
      );

      // Notes listener
      const notesPath = `users/${uid}/notes`;
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'users', uid, 'notes'), where('ownerId', '==', uid)),
          (snap) => {
            const list: Note[] = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Note, 'id'>),
            }));
            list.sort((a, b) => {
              if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
              return timestampToMillis(b.updatedAt) - timestampToMillis(a.updatedAt);
            });
            setNotes(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, notesPath)
        )
      );

      // Tasks listener
      const tasksPath = `users/${uid}/tasks`;
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'users', uid, 'tasks'), where('ownerId', '==', uid)),
          (snap) => {
            const list: StudyTask[] = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<StudyTask, 'id'>),
            }));
            list.sort((a, b) => {
              if (a.completed !== b.completed) return a.completed ? 1 : -1;
              if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
              if (a.dueDate) return -1;
              if (b.dueDate) return 1;
              return timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt);
            });
            setTasks(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, tasksPath)
        )
      );

      // Activities listener
      const activitiesPath = `users/${uid}/activities`;
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'users', uid, 'activities'), where('ownerId', '==', uid)),
          (snap) => {
            const list: StudyActivity[] = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<StudyActivity, 'id'>),
            }));
            list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
            setActivities(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, activitiesPath)
        )
      );

      // Billing Records listener
      const billingPath = `users/${uid}/billingRecords`;
      unsubscribers.push(
        onSnapshot(
          query(collection(db, 'users', uid, 'billingRecords'), where('ownerId', '==', uid)),
          (snap) => {
            const list: BillingRecord[] = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<BillingRecord, 'id'>),
            }));
            list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
            setBillingRecords(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, billingPath)
        )
      );
    }

    void bootstrapUserWorkspace(user.uid, user.displayName);

    return () => {
      active = false;
      unsubscribers.forEach((fn) => fn());
    };
  }, [user]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const logStudyActivity = useCallback(
    async (input: {
      type: ActivityType;
      label: string;
      subjectId?: string;
      durationMinutes?: number;
    }) => {
      if (!user) return;
      const activityId = generateSafeId('act');
      const path = `users/${user.uid}/activities/${activityId}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'activities', activityId), {
          ownerId: user.uid,
          type: input.type,
          label: clampString(input.label, BLUEPRINT_LIMITS.ACTIVITY_LABEL_MAX) || 'Study activity',
          subjectId: sanitizeOptionalId(input.subjectId),
          durationMinutes: Math.min(
            Math.max(0, Math.round(input.durationMinutes ?? 0)),
            BLUEPRINT_LIMITS.ACTIVITY_DURATION_MAX
          ),
          dateKey: getTodayDateKey(),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user]
  );

  const updateProfile = useCallback(
    async (updates: {
      displayName: string;
      majorOrGrade: string;
      dailyGoalMinutes: number;
    }) => {
      if (!user) return;
      const path = `users/${user.uid}`;
      const safeName =
        clampString(updates.displayName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Student';
      const safeMajor = clampString(updates.majorOrGrade, BLUEPRINT_LIMITS.MAJOR_MAX);
      const safeGoal = Math.min(
        Math.max(Math.round(updates.dailyGoalMinutes || 60), BLUEPRINT_LIMITS.DAILY_GOAL_MIN),
        BLUEPRINT_LIMITS.DAILY_GOAL_MAX
      );
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: safeName,
          majorOrGrade: safeMajor,
          dailyGoalMinutes: safeGoal,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const createSubject = useCallback(
    async (input: {
      name: string;
      code: string;
      color: SubjectColor;
      description: string;
    }) => {
      if (!user) throw new Error('Sign in required.');
      const subjectId = generateSafeId('sub');
      const path = `users/${user.uid}/subjects/${subjectId}`;
      const safeName = clampString(input.name, BLUEPRINT_LIMITS.SUBJECT_NAME_MAX);
      if (!safeName) throw new Error('Subject name is required.');
      try {
        await setDoc(doc(db, 'users', user.uid, 'subjects', subjectId), {
          ownerId: user.uid,
          name: safeName,
          code: clampString(input.code, BLUEPRINT_LIMITS.SUBJECT_CODE_MAX),
          color: input.color,
          description: clampString(input.description, BLUEPRINT_LIMITS.SUBJECT_DESC_MAX),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return subjectId;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user]
  );

  const updateSubject = useCallback(
    async (
      subjectId: string,
      updates: {
        name: string;
        code: string;
        color: SubjectColor;
        description: string;
      }
    ) => {
      if (!user) return;
      const path = `users/${user.uid}/subjects/${subjectId}`;
      const safeName = clampString(updates.name, BLUEPRINT_LIMITS.SUBJECT_NAME_MAX);
      if (!safeName) throw new Error('Subject name is required.');
      try {
        await updateDoc(doc(db, 'users', user.uid, 'subjects', subjectId), {
          name: safeName,
          code: clampString(updates.code, BLUEPRINT_LIMITS.SUBJECT_CODE_MAX),
          color: updates.color,
          description: clampString(updates.description, BLUEPRINT_LIMITS.SUBJECT_DESC_MAX),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const deleteSubject = useCallback(
    async (subjectId: string) => {
      if (!user) return;
      const path = `users/${user.uid}/subjects/${subjectId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'subjects', subjectId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const createNote = useCallback(
    async (input: {
      title: string;
      subjectId?: string;
      sourceType: SourceType;
      noteStyle?: NoteStyle;
      sourceFileName?: string;
      audioDurationSec?: number;
      summary?: string;
      content?: string;
      transcript?: string;
      keyTakeaways?: string[];
      flashcards?: Flashcard[];
    }) => {
      if (!user) throw new Error('Sign in required.');
      const noteId = generateSafeId('note');
      const path = `users/${user.uid}/notes/${noteId}`;
      const safeTitle =
        clampString(input.title, BLUEPRINT_LIMITS.NOTE_TITLE_MAX) || 'Untitled Note';
      const safeContent = (input.content || '').slice(0, BLUEPRINT_LIMITS.CONTENT_MAX);
      const safeTranscript = (input.transcript || '').slice(0, BLUEPRINT_LIMITS.TRANSCRIPT_MAX);
      const safeSummary = clampString(input.summary || '', BLUEPRINT_LIMITS.SUMMARY_MAX);
      const safeSubjectId = sanitizeOptionalId(input.subjectId);
      const words = Math.min(countWords(`${safeContent} ${safeTranscript}`), 100000);
      const audioDurationSec = Math.min(
        Math.max(0, Math.round(input.audioDurationSec || 0)),
        36000
      );

      try {
        await setDoc(doc(db, 'users', user.uid, 'notes', noteId), {
          ownerId: user.uid,
          title: safeTitle,
          subjectId: safeSubjectId,
          sourceType: input.sourceType,
          noteStyle: input.noteStyle || 'structured',
          sourceFileName: clampString(
            input.sourceFileName || '',
            BLUEPRINT_LIMITS.SOURCE_FILENAME_MAX
          ),
          audioDurationSec,
          summary: safeSummary,
          content: safeContent,
          transcript: safeTranscript,
          keyTakeaways: sanitizeTakeaways(input.keyTakeaways || []),
          flashcards: sanitizeFlashcards(input.flashcards || []),
          wordCount: words,
          isPinned: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const activityType: ActivityType =
          input.sourceType === 'audio'
            ? 'audio_transcribed'
            : input.sourceType === 'document'
              ? 'document_processed'
              : 'note_created';

        const estMinutes =
          input.sourceType === 'audio' && audioDurationSec > 0
            ? Math.max(1, Math.round(audioDurationSec / 60))
            : 0;

        await logStudyActivity({
          type: activityType,
          label: safeTitle,
          subjectId: safeSubjectId,
          durationMinutes: estMinutes,
        });

        return noteId;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, logStudyActivity]
  );

  const updateNote = useCallback(
    async (
      noteId: string,
      updates: {
        title?: string;
        subjectId?: string;
        noteStyle?: NoteStyle;
        summary?: string;
        content?: string;
        transcript?: string;
        keyTakeaways?: string[];
        flashcards?: Flashcard[];
      }
    ) => {
      if (!user) return;
      const existing = notes.find((n) => n.id === noteId);
      const path = `users/${user.uid}/notes/${noteId}`;

      const payload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };

      if (updates.title !== undefined) {
        payload.title =
          clampString(updates.title, BLUEPRINT_LIMITS.NOTE_TITLE_MAX) || 'Untitled Note';
      }
      if (updates.subjectId !== undefined) {
        payload.subjectId = sanitizeOptionalId(updates.subjectId);
      }
      if (updates.noteStyle !== undefined) {
        payload.noteStyle = updates.noteStyle;
      }
      if (updates.summary !== undefined) {
        payload.summary = clampString(updates.summary, BLUEPRINT_LIMITS.SUMMARY_MAX);
      }
      if (updates.content !== undefined) {
        payload.content = updates.content.slice(0, BLUEPRINT_LIMITS.CONTENT_MAX);
      }
      if (updates.transcript !== undefined) {
        payload.transcript = updates.transcript.slice(0, BLUEPRINT_LIMITS.TRANSCRIPT_MAX);
      }
      if (updates.keyTakeaways !== undefined) {
        payload.keyTakeaways = sanitizeTakeaways(updates.keyTakeaways);
      }
      if (updates.flashcards !== undefined) {
        payload.flashcards = sanitizeFlashcards(updates.flashcards);
      }

      if (updates.content !== undefined || updates.transcript !== undefined) {
        const nextContent =
          updates.content !== undefined ? updates.content : existing?.content || '';
        const nextTranscript =
          updates.transcript !== undefined ? updates.transcript : existing?.transcript || '';
        payload.wordCount = Math.min(countWords(`${nextContent} ${nextTranscript}`), 100000);
      }

      try {
        await updateDoc(doc(db, 'users', user.uid, 'notes', noteId), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user, notes]
  );

  const togglePinNote = useCallback(
    async (noteId: string, currentPinned: boolean) => {
      if (!user) return;
      const path = `users/${user.uid}/notes/${noteId}`;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'notes', noteId), {
          isPinned: !currentPinned,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const updateNoteFlashcards = useCallback(
    async (noteId: string, flashcards: Flashcard[]) => {
      if (!user) return;
      const path = `users/${user.uid}/notes/${noteId}`;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'notes', noteId), {
          flashcards: sanitizeFlashcards(flashcards),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!user) return;
      const path = `users/${user.uid}/notes/${noteId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'notes', noteId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const createTask = useCallback(
    async (input: {
      title: string;
      details?: string;
      subjectId?: string;
      noteId?: string;
      dueDate?: string;
      priority?: TaskPriority;
      reminderEnabled?: boolean;
    }) => {
      if (!user) throw new Error('Sign in required.');
      const taskId = generateSafeId('task');
      const path = `users/${user.uid}/tasks/${taskId}`;
      const safeTitle = clampString(input.title, BLUEPRINT_LIMITS.TASK_TITLE_MAX);
      if (!safeTitle) throw new Error('Task title is required.');

      try {
        await setDoc(doc(db, 'users', user.uid, 'tasks', taskId), {
          ownerId: user.uid,
          title: safeTitle,
          details: clampString(input.details || '', BLUEPRINT_LIMITS.TASK_DETAILS_MAX),
          subjectId: sanitizeOptionalId(input.subjectId),
          noteId: sanitizeOptionalId(input.noteId),
          dueDate: clampString(input.dueDate || '', BLUEPRINT_LIMITS.TASK_DUE_DATE_MAX),
          priority: input.priority || 'medium',
          reminderEnabled: Boolean(input.reminderEnabled),
          completed: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return taskId;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user]
  );

  const toggleTaskCompleted = useCallback(
    async (task: StudyTask) => {
      if (!user) return;
      const path = `users/${user.uid}/tasks/${task.id}`;
      const nextCompleted = !task.completed;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), {
          completed: nextCompleted,
          updatedAt: serverTimestamp(),
        });
        if (nextCompleted) {
          await logStudyActivity({
            type: 'task_completed',
            label: task.title,
            subjectId: task.subjectId,
            durationMinutes: 0,
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user, logStudyActivity]
  );

  const toggleTaskReminder = useCallback(
    async (task: StudyTask) => {
      if (!user) return;
      const path = `users/${user.uid}/tasks/${task.id}`;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), {
          reminderEnabled: !task.reminderEnabled,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const updateTask = useCallback(
    async (
      taskId: string,
      updates: {
        title: string;
        details: string;
        subjectId: string;
        noteId: string;
        dueDate: string;
        priority: TaskPriority;
        reminderEnabled: boolean;
      }
    ) => {
      if (!user) return;
      const path = `users/${user.uid}/tasks/${taskId}`;
      const safeTitle = clampString(updates.title, BLUEPRINT_LIMITS.TASK_TITLE_MAX);
      if (!safeTitle) throw new Error('Task title is required.');
      try {
        await updateDoc(doc(db, 'users', user.uid, 'tasks', taskId), {
          title: safeTitle,
          details: clampString(updates.details, BLUEPRINT_LIMITS.TASK_DETAILS_MAX),
          subjectId: sanitizeOptionalId(updates.subjectId),
          noteId: sanitizeOptionalId(updates.noteId),
          dueDate: clampString(updates.dueDate, BLUEPRINT_LIMITS.TASK_DUE_DATE_MAX),
          priority: updates.priority,
          reminderEnabled: updates.reminderEnabled,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!user) return;
      const path = `users/${user.uid}/tasks/${taskId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'tasks', taskId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const recordBillingCheckout = useCallback(
    async (receipt: {
      receiptId: string;
      planId: PlanId;
      billingCycle: BillingCycle;
      paymentMethod: PaymentMethodId;
      paymentMethodLabel: string;
      amountCents: number;
      currency: CurrencyCode;
      promoCode: string;
      gatewayOrderId: string;
      gatewayPaymentId: string;
      gatewayMode: GatewayMode;
      status: 'completed';
    }) => {
      if (!user) throw new Error('Sign in required.');
      const recordId = generateSafeId('bill');
      const billingPath = `users/${user.uid}/billingRecords/${recordId}`;
      const profilePath = `users/${user.uid}`;
      const safeReceiptId = receipt.receiptId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

      try {
        await setDoc(doc(db, 'users', user.uid, 'billingRecords', recordId), {
          ownerId: user.uid,
          receiptId: safeReceiptId,
          planId: receipt.planId,
          billingCycle: receipt.billingCycle,
          paymentMethod: receipt.paymentMethod,
          amountCents: Math.min(Math.max(0, Math.round(receipt.amountCents)), 5000000),
          currency: receipt.currency === 'USD' ? 'USD' : 'INR',
          promoCode: clampString(receipt.promoCode, BLUEPRINT_LIMITS.PROMO_CODE_MAX),
          gatewayOrderId: clampString(
            receipt.gatewayOrderId || '',
            BLUEPRINT_LIMITS.GATEWAY_ID_MAX
          ),
          gatewayPaymentId: clampString(
            receipt.gatewayPaymentId || '',
            BLUEPRINT_LIMITS.GATEWAY_ID_MAX
          ),
          gatewayMode: receipt.gatewayMode,
          status: receipt.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, billingPath);
      }

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          planId: receipt.planId,
          billingCycle: receipt.billingCycle,
          paymentMethod: clampString(
            receipt.paymentMethodLabel,
            BLUEPRINT_LIMITS.PAYMENT_METHOD_LABEL_MAX
          ),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, profilePath);
      }
    },
    [user]
  );

  return (
    <NotevoxContext.Provider
      value={{
        user,
        authLoading,
        dataReady,
        authError,
        profile,
        subjects,
        notes,
        tasks,
        activities,
        billingRecords,
        signInWithGoogle,
        signOutUser,
        updateProfile,
        createSubject,
        updateSubject,
        deleteSubject,
        createNote,
        updateNote,
        togglePinNote,
        updateNoteFlashcards,
        deleteNote,
        createTask,
        toggleTaskCompleted,
        toggleTaskReminder,
        updateTask,
        deleteTask,
        logStudyActivity,
        recordBillingCheckout,
      }}
    >
      {children}
    </NotevoxContext.Provider>
  );
}

export function useNotevox() {
  const ctx = useContext(NotevoxContext);
  if (!ctx) {
    throw new Error('useNotevox must be used within a NotevoxProvider.');
  }
  return ctx;
}
