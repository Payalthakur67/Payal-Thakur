import type { Timestamp } from 'firebase/firestore';

export type SubjectColor = 'pink' | 'green' | 'sky' | 'yellow' | 'lavender';
export type SourceType = 'manual' | 'audio' | 'document';
export type NoteStyle = 'structured' | 'cornell' | 'revision' | 'summary';
export type TaskPriority = 'low' | 'medium' | 'high';
export type ActivityType =
  | 'note_created'
  | 'audio_transcribed'
  | 'document_processed'
  | 'task_completed'
  | 'study_session';
export type PlanId = 'starter' | 'scholar' | 'campus';
export type BillingCycle = 'monthly' | 'annual';
export type CurrencyCode = 'INR' | 'USD';
export type PaymentMethodId =
  | 'razorpay'
  | 'card'
  | 'upi'
  | 'netbanking'
  | 'apple_pay'
  | 'student_grant';
export type GatewayMode =
  | 'razorpay_live'
  | 'razorpay_test'
  | 'razorpay_sandbox'
  | 'free_activation';

export type NavView =
  | 'dashboard'
  | 'notes'
  | 'recorder'
  | 'subjects'
  | 'tasks'
  | 'billing';

export interface Flashcard {
  front: string;
  back: string;
}

export interface UserProfile {
  ownerId: string;
  displayName: string;
  majorOrGrade: string;
  dailyGoalMinutes: number;
  planId: PlanId;
  billingCycle: BillingCycle;
  paymentMethod: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Subject {
  id: string;
  ownerId: string;
  name: string;
  code: string;
  color: SubjectColor;
  description: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Note {
  id: string;
  ownerId: string;
  title: string;
  subjectId: string;
  sourceType: SourceType;
  noteStyle: NoteStyle;
  sourceFileName: string;
  audioDurationSec: number;
  summary: string;
  content: string;
  transcript: string;
  keyTakeaways: string[];
  flashcards: Flashcard[];
  wordCount: number;
  isPinned: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface StudyTask {
  id: string;
  ownerId: string;
  title: string;
  details: string;
  subjectId: string;
  noteId: string;
  dueDate: string;
  priority: TaskPriority;
  reminderEnabled: boolean;
  completed: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface StudyActivity {
  id: string;
  ownerId: string;
  type: ActivityType;
  label: string;
  subjectId: string;
  durationMinutes: number;
  dateKey: string;
  createdAt?: Timestamp | null;
}

export interface BillingRecord {
  id: string;
  ownerId: string;
  receiptId: string;
  planId: PlanId;
  billingCycle: BillingCycle;
  paymentMethod: PaymentMethodId;
  amountCents: number;
  currency: CurrencyCode;
  promoCode: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewayMode?: GatewayMode;
  status: 'pending' | 'completed';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  audience: string;
  accent: 'sky' | 'pink' | 'lavender';
  pricing: {
    INR: {
      monthlySubunits: number;
      annualMonthlyEquivalentSubunits: number;
      annualTotalSubunits: number;
    };
    USD: {
      monthlySubunits: number;
      annualMonthlyEquivalentSubunits: number;
      annualTotalSubunits: number;
    };
  };
  limits: {
    audioMinutesPerMonth: string;
    documentUploadsPerMonth: string;
    flashcardDecks: string;
    audioReadout: string;
    cloudSync: string;
  };
}

export interface PaymentMethodDefinition {
  id: PaymentMethodId;
  label: string;
  detail: string;
}

export interface SuggestedStudyTask {
  title: string;
  priority: TaskPriority;
}

export interface StructuredNoteResponse {
  title: string;
  summary: string;
  content: string;
  keyTakeaways: string[];
  flashcards: Flashcard[];
  suggestedTasks: SuggestedStudyTask[];
}

/**
 * Verbatim volumetric limits synchronized with firebase-blueprint.json & firestore.rules
 */
export const BLUEPRINT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  DISPLAY_NAME_MAX: 80,
  MAJOR_MAX: 80,
  DAILY_GOAL_MIN: 5,
  DAILY_GOAL_MAX: 720,
  PAYMENT_METHOD_LABEL_MAX: 60,
  SUBJECT_NAME_MAX: 80,
  SUBJECT_CODE_MAX: 24,
  SUBJECT_DESC_MAX: 240,
  NOTE_TITLE_MAX: 160,
  SOURCE_FILENAME_MAX: 200,
  SUMMARY_MAX: 4000,
  CONTENT_MAX: 120000,
  TRANSCRIPT_MAX: 120000,
  TAKEAWAYS_MAX_COUNT: 15,
  TAKEAWAY_ITEM_MAX: 400,
  FLASHCARDS_MAX_COUNT: 30,
  FLASHCARD_FRONT_MAX: 500,
  FLASHCARD_BACK_MAX: 1000,
  TASK_TITLE_MAX: 160,
  TASK_DETAILS_MAX: 500,
  TASK_DUE_DATE_MAX: 32,
  ACTIVITY_LABEL_MAX: 160,
  ACTIVITY_DURATION_MAX: 600,
  PROMO_CODE_MAX: 32,
  GATEWAY_ID_MAX: 100,
} as const;
