/**
 * Phase 0 Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
 *
 * Designed to verify firestore.rules against the 12 adversarial payloads defined
 * in security_spec.md when run against the Firebase Firestore Rules Emulator
 * with @firebase/rules-unit-testing.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; emailVerified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Note Creation',
    collectionPath: '/users/attacker_uid/notes/note_1',
    operation: 'create',
    auth: { uid: 'attacker_uid', emailVerified: true },
    payload: {
      ownerId: 'victim_uid',
      title: 'Spoofed Note',
      subjectId: '',
      sourceType: 'manual',
      noteStyle: 'structured',
      sourceFileName: '',
      audioDurationSec: 0,
      summary: '',
      content: 'Attempted cross-owner attribution',
      transcript: '',
      keyTakeaways: [],
      flashcards: [],
      wordCount: 3,
      isPinned: false,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-Tenant List Scraping',
    collectionPath: '/users/victim_uid/notes',
    operation: 'list',
    auth: { uid: 'attacker_uid', emailVerified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on UserProfile',
    collectionPath: '/users/student_1',
    operation: 'update',
    auth: { uid: 'student_1', emailVerified: true },
    payload: {
      displayName: 'Payal',
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unverified Email Write Attempt',
    collectionPath: '/users/unverified_1/subjects/sub_1',
    operation: 'create',
    auth: { uid: 'unverified_1', emailVerified: false },
    payload: {
      ownerId: 'unverified_1',
      name: 'Physics',
      code: 'PHY-101',
      color: 'sky',
      description: '',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Document ID Poisoning',
    collectionPath: '/users/student_1/notes/invalid id with spaces!@#',
    operation: 'create',
    auth: { uid: 'student_1', emailVerified: true },
    payload: {
      ownerId: 'student_1',
      title: 'Bad ID',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client Timestamp Forgery',
    collectionPath: '/users/student_1/tasks/task_1',
    operation: 'create',
    auth: { uid: 'student_1', emailVerified: true },
    payload: {
      ownerId: 'student_1',
      title: 'Backdated task',
      details: '',
      subjectId: '',
      noteId: '',
      dueDate: '2026-12-01',
      priority: 'medium',
      reminderEnabled: false,
      completed: false,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable createdAt Tampering',
    collectionPath: '/users/student_1/notes/note_1',
    operation: 'update',
    auth: { uid: 'student_1', emailVerified: true },
    payload: {
      title: 'Updated Title',
      createdAt: '2021-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Value Poisoning on Allowed Update Field',
    collectionPath: '/users/student_1/tasks/task_1',
    operation: 'update',
    auth: { uid: 'student_1', emailVerified: true },
    payload: {
      priority: 'SUPER_URGENT',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Bounded Array Exhaustion & Element Type Poisoning',
    collectionPath: '/users/student_1/notes/note_2',
    operation: 'create',
    auth: { uid: 'student_1', emailVerified: true },
    payload: {
      ownerId: 'student_1',
      title: 'Poisoned Array',
      keyTakeaways: [12345, 67890],
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Terminal BillingRecord Mutation After Completion',
    collectionPath: '/users/student_1/billingRecords/rec_1',
    operation: 'update',
    auth: { uid: 'student_1', emailVerified: true },
    payload: {
      amountCents: 0,
      status: 'pending',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Orphaned Subcollection Write Without Parent Profile (Master Gate)',
    collectionPath: '/users/ghost_uid/subjects/sub_orphan',
    operation: 'create',
    auth: { uid: 'ghost_uid', emailVerified: true },
    payload: {
      ownerId: 'ghost_uid',
      name: 'Orphan Subject',
      code: '',
      color: 'pink',
      description: '',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Immutable StudyActivity Log Tampering',
    collectionPath: '/users/student_1/activities/act_1',
    operation: 'update',
    auth: { uid: 'student_1', emailVerified: true },
    payload: {
      durationMinutes: 999,
    },
    expected: 'PERMISSION_DENIED',
  },
];
