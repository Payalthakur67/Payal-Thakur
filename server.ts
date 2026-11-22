import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  transcribeAudioBuffer,
  generateStructuredNotesFromText,
  processUploadedDocument,
  generateFlashcardsForNote,
  askQuestionAboutNote,
  synthesizeNoteSummaryAudio,
  type NoteStyleOption,
} from './server/gemini.ts';
import {
  NOTEVOX_PLANS,
  PAYMENT_METHODS,
  calculateQuote,
  createRazorpayOrder,
  getRazorpayConfig,
  verifyRazorpayPayment,
  type PlanId,
  type BillingCycle,
  type CurrencyCode,
  type PaymentMethodId,
} from './server/billing.ts';
import {
  buildOneFileCodeScript,
  buildSingleHtmlBundle,
  buildWebsiteArchive,
} from './server/exportZip.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB audio limit
});

const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB document limit
});

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('GEMINI_API_KEY is missing')) {
    return {
      status: 403,
      message:
        'Gemini API key error. Please verify your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        'Gemini API quota limit reached right now. Please wait a moment and try again, or check your key quota in Settings > Secrets.',
    };
  }
  if (raw.includes('File too large') || raw.includes('LIMIT_FILE_SIZE')) {
    return {
      status: 413,
      message: 'Uploaded file exceeds the maximum allowed size limit (25MB for audio, 20MB for documents).',
    };
  }
  return { status: 500, message: raw || 'An unexpected server error occurred.' };
}

function parseNoteStyle(val: unknown): NoteStyleOption {
  if (val === 'cornell' || val === 'revision' || val === 'summary' || val === 'structured') {
    return val;
  }
  return 'structured';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Health Check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'notevox' });
  });

  // ---------------------------------------------------------------------------
  // AI Speech-to-Text & Notes Endpoints
  // ---------------------------------------------------------------------------
  app.post('/api/ai/transcribe', uploadAudio.single('audio'), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file || !file.buffer || file.buffer.length === 0) {
        res.status(400).json({ error: 'Please record or upload an audio file to transcribe.' });
        return;
      }

      const transcript = await transcribeAudioBuffer(
        file.buffer,
        file.mimetype,
        file.originalname
      );

      const shouldGenerateNotes = req.body?.generateNotes === 'true';
      if (!shouldGenerateNotes) {
        res.json({ transcript });
        return;
      }

      const noteStyle = parseNoteStyle(req.body?.noteStyle);
      const sourceTitle =
        typeof req.body?.title === 'string' && req.body.title.trim()
          ? req.body.title.trim()
          : file.originalname.replace(/\.[^.]+$/, '') || 'Recorded Lecture';
      const subjectName = typeof req.body?.subjectName === 'string' ? req.body.subjectName.trim() : '';

      const note = await generateStructuredNotesFromText({
        sourceText: transcript,
        sourceTitle,
        noteStyle,
        subjectName,
      });

      res.json({ transcript, note });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/process-document', uploadDocument.single('file'), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file || !file.buffer || file.buffer.length === 0) {
        res.status(400).json({ error: 'Please upload a supported study document (PDF, DOCX, TXT, MD, or slide image).' });
        return;
      }

      const noteStyle = parseNoteStyle(req.body?.noteStyle);
      const subjectName = typeof req.body?.subjectName === 'string' ? req.body.subjectName.trim() : '';
      const customInstructions =
        typeof req.body?.customInstructions === 'string' ? req.body.customInstructions.trim() : '';

      const result = await processUploadedDocument({
        buffer: file.buffer,
        mimeType: file.mimetype,
        fileName: file.originalname,
        noteStyle,
        subjectName,
        customInstructions,
      });

      res.json({ note: result });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/generate-notes', async (req: Request, res: Response) => {
    try {
      const { sourceText, sourceTitle, noteStyle, subjectName, customInstructions } = req.body || {};
      if (typeof sourceText !== 'string' || sourceText.trim().length < 10) {
        res.status(400).json({ error: 'Please provide at least a short paragraph of text or transcript to structure.' });
        return;
      }

      const note = await generateStructuredNotesFromText({
        sourceText,
        sourceTitle: typeof sourceTitle === 'string' ? sourceTitle : undefined,
        noteStyle: parseNoteStyle(noteStyle),
        subjectName: typeof subjectName === 'string' ? subjectName : undefined,
        customInstructions: typeof customInstructions === 'string' ? customInstructions : undefined,
      });

      res.json({ note });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/flashcards', async (req: Request, res: Response) => {
    try {
      const { title, content, transcript, count } = req.body || {};
      if (!content && !transcript) {
        res.status(400).json({ error: 'This note needs content or a transcript before flashcards can be generated.' });
        return;
      }

      const flashcards = await generateFlashcardsForNote({
        title: typeof title === 'string' ? title : 'Study Note',
        content: typeof content === 'string' ? content : '',
        transcript: typeof transcript === 'string' ? transcript : '',
        count: typeof count === 'number' ? count : 6,
      });

      res.json({ flashcards });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/ask-note', async (req: Request, res: Response) => {
    try {
      const { noteTitle, noteContent, transcript, question, history } = req.body || {};
      if (typeof question !== 'string' || question.trim().length === 0) {
        res.status(400).json({ error: 'Please enter a study question.' });
        return;
      }

      const answer = await askQuestionAboutNote({
        noteTitle: typeof noteTitle === 'string' ? noteTitle : 'Study Note',
        noteContent: typeof noteContent === 'string' ? noteContent : '',
        transcript: typeof transcript === 'string' ? transcript : '',
        question: question.trim(),
        history: Array.isArray(history) ? history : [],
      });

      res.json({ answer });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/tts', async (req: Request, res: Response) => {
    try {
      const { text, voiceName } = req.body || {};
      if (typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'Text is required to generate spoken audio.' });
        return;
      }
      const audioBase64 = await synthesizeNoteSummaryAudio(
        text,
        typeof voiceName === 'string' ? voiceName : 'Kore'
      );
      res.json({ audioBase64, mimeType: 'audio/wav' });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Plans, Razorpay Checkout & Billing API
  // ---------------------------------------------------------------------------
  app.get('/api/billing/plans', (_req: Request, res: Response) => {
    const rzp = getRazorpayConfig();
    res.json({
      plans: NOTEVOX_PLANS,
      paymentMethods: PAYMENT_METHODS,
      sandboxPromoCodes: ['STUDENT25', 'CAMPUSFREE', 'STUDY15'],
      razorpay: {
        configured: rzp.configured,
        hasSecret: rzp.hasSecret,
        keyIdPreview: rzp.keyIdPreview,
        mode: rzp.mode,
      },
    });
  });

  app.post('/api/billing/validate-promo', (req: Request, res: Response) => {
    try {
      const { planId, billingCycle, currency, promoCode } = req.body || {};
      const safeCurrency: CurrencyCode = currency === 'USD' ? 'USD' : 'INR';
      const quote = calculateQuote(
        (planId || 'scholar') as PlanId,
        (billingCycle === 'annual' ? 'annual' : 'monthly') as BillingCycle,
        safeCurrency,
        typeof promoCode === 'string' ? promoCode : ''
      );
      res.json(quote);
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(400).json({ error: formatted.message });
    }
  });

  app.post('/api/billing/razorpay/create-order', async (req: Request, res: Response) => {
    try {
      const { planId, billingCycle, currency, paymentMethod, promoCode } = req.body || {};
      if (planId !== 'starter' && planId !== 'scholar' && planId !== 'campus') {
        res.status(400).json({ error: 'Invalid plan selected.' });
        return;
      }
      const cycle: BillingCycle = billingCycle === 'annual' ? 'annual' : 'monthly';
      const safeCurrency: CurrencyCode = currency === 'USD' ? 'USD' : 'INR';
      const validMethods: PaymentMethodId[] = [
        'razorpay',
        'card',
        'upi',
        'netbanking',
        'apple_pay',
        'student_grant',
      ];
      const method: PaymentMethodId = validMethods.includes(paymentMethod)
        ? paymentMethod
        : 'razorpay';

      const orderPayload = await createRazorpayOrder({
        planId,
        billingCycle: cycle,
        currency: safeCurrency,
        paymentMethod: method,
        promoCode: typeof promoCode === 'string' ? promoCode : '',
      });
      res.json(orderPayload);
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(400).json({ error: formatted.message });
    }
  });

  app.post('/api/billing/razorpay/verify', (req: Request, res: Response) => {
    try {
      const {
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        paymentMethod,
        paymentLabel,
        sandboxConfirm,
      } = req.body || {};

      if (typeof razorpayOrderId !== 'string' || !razorpayOrderId.trim()) {
        res.status(400).json({ error: 'Razorpay order ID is required for payment verification.' });
        return;
      }

      const validMethods: PaymentMethodId[] = [
        'razorpay',
        'card',
        'upi',
        'netbanking',
        'apple_pay',
        'student_grant',
      ];
      const safeMethod: PaymentMethodId = validMethods.includes(paymentMethod)
        ? paymentMethod
        : 'razorpay';

      const result = verifyRazorpayPayment({
        razorpayOrderId: razorpayOrderId.trim(),
        razorpayPaymentId: typeof razorpayPaymentId === 'string' ? razorpayPaymentId : undefined,
        razorpaySignature: typeof razorpaySignature === 'string' ? razorpaySignature : undefined,
        paymentMethod: safeMethod,
        paymentLabel: typeof paymentLabel === 'string' ? paymentLabel : undefined,
        sandboxConfirm: Boolean(sandboxConfirm),
      });

      res.json(result);
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(400).json({ error: formatted.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Website Source Downloads (.zip, One-File Compressed .mjs, Standalone .html)
  // ---------------------------------------------------------------------------
  app.get('/api/export/notevox-website.zip', (_req: Request, res: Response) => {
    try {
      const zipBuffer = buildWebsiteArchive(__dirname);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="notevox-website.zip"');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(500).json({ error: formatted.message });
    }
  });

  app.get('/api/export/notevox-onefile.mjs', (_req: Request, res: Response) => {
    try {
      const bundleBuffer = buildOneFileCodeScript(__dirname);
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="notevox-onefile.mjs"');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', String(bundleBuffer.length));
      res.send(bundleBuffer);
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(500).json({ error: formatted.message });
    }
  });

  app.get('/api/export/notevox-single.html', (_req: Request, res: Response) => {
    try {
      const htmlBuffer = buildSingleHtmlBundle(__dirname);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="notevox-single.html"');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', String(htmlBuffer.length));
      res.send(htmlBuffer);
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(500).json({ error: formatted.message });
    }
  });

  // Multer & Express Error Middleware
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const formatted = formatApiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  });

  // Vite middleware in development; static bundle in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Notevox server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Notevox server:', err);
  process.exit(1);
});
