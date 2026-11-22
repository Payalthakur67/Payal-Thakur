import type {
  BillingCycle,
  CurrencyCode,
  Flashcard,
  GatewayMode,
  NoteStyle,
  PaymentMethodDefinition,
  PaymentMethodId,
  PlanDefinition,
  PlanId,
  StructuredNoteResponse,
} from '../types';

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed with status ${res.status}`;
    throw new Error(errMsg);
  }
  return data as T;
}

export async function transcribeAudioApi(params: {
  audioBlob: Blob;
  fileName: string;
  generateNotes: boolean;
  noteStyle: NoteStyle;
  title?: string;
  subjectName?: string;
}): Promise<{ transcript: string; note?: StructuredNoteResponse }> {
  const form = new FormData();
  form.append('audio', params.audioBlob, params.fileName);
  form.append('generateNotes', params.generateNotes ? 'true' : 'false');
  form.append('noteStyle', params.noteStyle);
  if (params.title) form.append('title', params.title);
  if (params.subjectName) form.append('subjectName', params.subjectName);

  const res = await fetch('/api/ai/transcribe', {
    method: 'POST',
    body: form,
  });
  return parseJsonResponse<{ transcript: string; note?: StructuredNoteResponse }>(res);
}

export async function processDocumentApi(params: {
  file: File;
  noteStyle: NoteStyle;
  subjectName?: string;
  customInstructions?: string;
}): Promise<{ note: StructuredNoteResponse & { extractedPreview?: string } }> {
  const form = new FormData();
  form.append('file', params.file, params.file.name);
  form.append('noteStyle', params.noteStyle);
  if (params.subjectName) form.append('subjectName', params.subjectName);
  if (params.customInstructions) form.append('customInstructions', params.customInstructions);

  const res = await fetch('/api/ai/process-document', {
    method: 'POST',
    body: form,
  });
  return parseJsonResponse<{ note: StructuredNoteResponse & { extractedPreview?: string } }>(res);
}

export async function generateNotesFromTextApi(params: {
  sourceText: string;
  sourceTitle?: string;
  noteStyle: NoteStyle;
  subjectName?: string;
  customInstructions?: string;
}): Promise<{ note: StructuredNoteResponse }> {
  const res = await fetch('/api/ai/generate-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonResponse<{ note: StructuredNoteResponse }>(res);
}

export async function generateFlashcardsApi(params: {
  title: string;
  content: string;
  transcript?: string;
  count?: number;
}): Promise<{ flashcards: Flashcard[] }> {
  const res = await fetch('/api/ai/flashcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonResponse<{ flashcards: Flashcard[] }>(res);
}

export async function askNoteApi(params: {
  noteTitle: string;
  noteContent: string;
  transcript?: string;
  question: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<{ answer: string }> {
  const res = await fetch('/api/ai/ask-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonResponse<{ answer: string }>(res);
}

export async function synthesizeTtsApi(params: {
  text: string;
  voiceName?: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const res = await fetch('/api/ai/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonResponse<{ audioBase64: string; mimeType: string }>(res);
}

export interface VerifiedReceiptPayload {
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
}

export async function fetchBillingPlansApi(): Promise<{
  plans: PlanDefinition[];
  paymentMethods: PaymentMethodDefinition[];
  sandboxPromoCodes: string[];
  razorpay: {
    configured: boolean;
    hasSecret?: boolean;
    keyIdPreview?: string | null;
    mode: GatewayMode;
  };
}> {
  const res = await fetch('/api/billing/plans');
  return parseJsonResponse(res);
}

export async function validatePromoApi(params: {
  planId: PlanId;
  billingCycle: BillingCycle;
  currency: CurrencyCode;
  promoCode: string;
}): Promise<{
  validPromo: boolean;
  promoMessage: string;
  planId: PlanId;
  billingCycle: BillingCycle;
  currency: CurrencyCode;
  promoCode: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}> {
  const res = await fetch('/api/billing/validate-promo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonResponse(res);
}

export type RazorpayOrderApiResponse =
  | {
      freeActivation: true;
      gatewayMode: GatewayMode;
      receipt: VerifiedReceiptPayload;
    }
  | {
      freeActivation: false;
      gatewayMode: GatewayMode;
      keyId: string | null;
      orderId: string;
      useRazorpayOrderId?: boolean;
      amount: number;
      currency: CurrencyCode;
      receiptId: string;
      planId: PlanId;
      billingCycle: BillingCycle;
      promoCode: string;
    };

export async function createRazorpayOrderApi(params: {
  planId: PlanId;
  billingCycle: BillingCycle;
  currency: CurrencyCode;
  promoCode?: string;
  paymentMethod?: PaymentMethodId;
}): Promise<RazorpayOrderApiResponse> {
  const res = await fetch('/api/billing/razorpay/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonResponse<RazorpayOrderApiResponse>(res);
}

export async function verifyRazorpayPaymentApi(params: {
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  paymentMethod?: PaymentMethodId;
  paymentLabel?: string;
  sandboxConfirm?: boolean;
}): Promise<{ verified: true; receipt: VerifiedReceiptPayload }> {
  const res = await fetch('/api/billing/razorpay/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonResponse<{ verified: true; receipt: VerifiedReceiptPayload }>(res);
}
