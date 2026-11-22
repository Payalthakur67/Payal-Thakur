import { GoogleGenAI, Type } from '@google/genai';
import mammoth from 'mammoth';

export type NoteStyleOption = 'structured' | 'cornell' | 'revision' | 'summary';

export interface GeneratedFlashcard {
  front: string;
  back: string;
}

export interface SuggestedStudyTask {
  title: string;
  priority: 'low' | 'medium' | 'high';
}

export interface StructuredNoteResult {
  title: string;
  summary: string;
  content: string;
  keyTakeaways: string[];
  flashcards: GeneratedFlashcard[];
  suggestedTasks: SuggestedStudyTask[];
}

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is missing. Please configure a Gemini API key in Settings > Secrets.'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('500') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('DEADLINE_EXCEEDED');
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

export function normalizeAudioMimeType(rawMime: string, filename = ''): string {
  const cleaned = (rawMime || '').split(';')[0].trim().toLowerCase();
  const ext = filename.toLowerCase().split('.').pop() || '';

  if (cleaned === 'audio/mpeg' || cleaned === 'audio/mp3' || ext === 'mp3') return 'audio/mp3';
  if (cleaned === 'audio/wav' || cleaned === 'audio/x-wav' || cleaned === 'audio/wave' || ext === 'wav') return 'audio/wav';
  if (cleaned === 'audio/webm' || cleaned === 'video/webm' || ext === 'webm') return 'audio/webm';
  if (cleaned === 'audio/ogg' || ext === 'ogg') return 'audio/ogg';
  if (cleaned === 'audio/mp4' || cleaned === 'audio/m4a' || cleaned === 'audio/x-m4a' || ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
  if (cleaned === 'audio/aac' || ext === 'aac') return 'audio/aac';
  if (cleaned === 'audio/flac' || ext === 'flac') return 'audio/flac';
  return cleaned.startsWith('audio/') ? cleaned : 'audio/webm';
}

function getStylePromptDirective(noteStyle: NoteStyleOption): string {
  switch (noteStyle) {
    case 'cornell':
      return (
        'Format the Markdown `content` using the Cornell Note-Taking Method: ' +
        'use `## Key Questions & Cues` with study prompts, `## Detailed Lecture & Reading Notes` organized clearly with subheadings and bullet points, ' +
        'and `## Synthesis & Connections` tying everything together.'
      );
    case 'revision':
      return (
        'Format the Markdown `content` as a high-yield Exam Revision Sheet: ' +
        'include `## Core Concepts & Definitions`, `## Key Formulas, Dates & Frameworks` (if relevant to the material), ' +
        '`## Common Pitfalls & Clarifications`, and `## Rapid Self-Check Questions`.'
      );
    case 'summary':
      return (
        'Format the Markdown `content` as a concise Actionable Study Summary: ' +
        'include `## Big Picture Overview`, `## Essential Highlights` (crisp bullets), and `## Next Steps to Master This Topic`.'
      );
    case 'structured':
    default:
      return (
        'Format the Markdown `content` as well-organized Structured Study Notes: ' +
        'use clear `##` topic sections, bold key terms with crisp explanations, bullet lists, tables where comparisons help, and concise examples strictly grounded in the source material.'
      );
  }
}

const STRUCTURED_NOTE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Clear, concise academic title for these study notes (under 100 characters).',
    },
    summary: {
      type: Type.STRING,
      description: 'A cohesive 2 to 4 sentence executive summary of the material.',
    },
    content: {
      type: Type.STRING,
      description: 'Rich, readable Markdown study notes strictly grounded in the provided material.',
    },
    keyTakeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Between 4 and 8 high-yield, single-sentence takeaways.',
    },
    flashcards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          front: { type: Type.STRING, description: 'Clear active-recall study question or term.' },
          back: { type: Type.STRING, description: 'Accurate, concise answer grounded in the source.' },
        },
        required: ['front', 'back'],
      },
      description: 'Between 4 and 8 active-recall study flashcards.',
    },
    suggestedTasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Actionable follow-up study task under 120 characters.' },
          priority: {
            type: Type.STRING,
            enum: ['low', 'medium', 'high'],
            description: 'Suggested study priority.',
          },
        },
        required: ['title', 'priority'],
      },
      description: 'Between 2 and 4 concrete follow-up study tasks.',
    },
  },
  required: ['title', 'summary', 'content', 'keyTakeaways', 'flashcards', 'suggestedTasks'],
};

function sanitizeStructuredNote(raw: unknown, fallbackTitle: string): StructuredNoteResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title =
    typeof obj.title === 'string' && obj.title.trim().length > 0
      ? obj.title.trim().slice(0, 150)
      : fallbackTitle.slice(0, 150);
  const summary =
    typeof obj.summary === 'string' ? obj.summary.trim().slice(0, 3800) : '';
  const content =
    typeof obj.content === 'string' ? obj.content.trim().slice(0, 115000) : '';

  const keyTakeaways = Array.isArray(obj.keyTakeaways)
    ? obj.keyTakeaways
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 380))
        .slice(0, 12)
    : [];

  const flashcards = Array.isArray(obj.flashcards)
    ? obj.flashcards
        .filter(
          (card): card is { front: string; back: string } =>
            Boolean(card) &&
            typeof card === 'object' &&
            typeof (card as Record<string, unknown>).front === 'string' &&
            typeof (card as Record<string, unknown>).back === 'string' &&
            String((card as Record<string, unknown>).front).trim().length > 0 &&
            String((card as Record<string, unknown>).back).trim().length > 0
        )
        .map((card) => ({
          front: card.front.trim().slice(0, 480),
          back: card.back.trim().slice(0, 950),
        }))
        .slice(0, 20)
    : [];

  const suggestedTasks = Array.isArray(obj.suggestedTasks)
    ? obj.suggestedTasks
        .filter(
          (t): t is { title: string; priority?: string } =>
            Boolean(t) &&
            typeof t === 'object' &&
            typeof (t as Record<string, unknown>).title === 'string' &&
            String((t as Record<string, unknown>).title).trim().length > 0
        )
        .map((t) => ({
          title: t.title.trim().slice(0, 150),
          priority: (t.priority === 'high' || t.priority === 'low' ? t.priority : 'medium') as
            | 'low'
            | 'medium'
            | 'high',
        }))
        .slice(0, 6)
    : [];

  return { title, summary, content, keyTakeaways, flashcards, suggestedTasks };
}

/**
 * Transcribe recorded or uploaded lecture audio using gemini-3.5-transcribe
 */
export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType: string,
  originalName = 'lecture.webm'
): Promise<string> {
  const ai = getClient();
  const normalizedMime = normalizeAudioMimeType(mimeType, originalName);
  const base64Audio = buffer.toString('base64');

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: normalizedMime,
              data: base64Audio,
            },
          },
          {
            text:
              'Transcribe this lecture or study recording accurately into clean, well-punctuated text. ' +
              'Preserve technical terminology, academic terms, equations, and natural paragraph breaks. ' +
              'If multiple speakers appear, separate speaker turns cleanly. Do not invent content not spoken in the audio.',
          },
        ],
      },
    })
  );

  const transcript = (response.text ?? '').trim();
  if (!transcript) {
    throw new Error(
      'No speech was detected in the audio recording. Please try speaking closer to your microphone or upload a clearer audio file.'
    );
  }
  return transcript.slice(0, 118000);
}

/**
 * Generate structured study notes, takeaways, flashcards, and suggested tasks from text or transcript
 */
export async function generateStructuredNotesFromText(params: {
  sourceText: string;
  sourceTitle?: string;
  noteStyle?: NoteStyleOption;
  subjectName?: string;
  customInstructions?: string;
}): Promise<StructuredNoteResult> {
  const ai = getClient();
  const noteStyle = params.noteStyle || 'structured';
  const styleDirective = getStylePromptDirective(noteStyle);

  const systemInstruction =
    'You are Notevox, an expert academic study-notes architect helping students master lectures and readings. ' +
    'Synthesize ONLY from the provided source text without inventing facts, references, or statistics. ' +
    'Write crisp, clear, encouraging, academically accurate study materials. ' +
    styleDirective;

  const userPrompt = [
    params.subjectName ? `Subject / Course: ${params.subjectName}` : '',
    params.sourceTitle ? `Source Title: ${params.sourceTitle}` : '',
    params.customInstructions ? `Student Focus Request: ${params.customInstructions}` : '',
    '--- SOURCE MATERIAL ---',
    params.sourceText.slice(0, 90000),
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: STRUCTURED_NOTE_SCHEMA,
      },
    })
  );

  const jsonStr = (response.text ?? '{}').trim();
  const parsed = JSON.parse(jsonStr);
  return sanitizeStructuredNote(parsed, params.sourceTitle || 'Untitled Study Note');
}

/**
 * Process an uploaded study document (PDF, DOCX, TXT, MD, CSV, or slide/whiteboard image)
 */
export async function processUploadedDocument(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  noteStyle?: NoteStyleOption;
  subjectName?: string;
  customInstructions?: string;
}): Promise<StructuredNoteResult & { extractedPreview: string }> {
  const ai = getClient();
  const ext = (params.fileName.split('.').pop() || '').toLowerCase();
  const mime = (params.mimeType || '').toLowerCase();
  const noteStyle = params.noteStyle || 'structured';
  const styleDirective = getStylePromptDirective(noteStyle);

  const systemInstruction =
    'You are Notevox, an expert academic study-notes architect helping students transform uploaded documents, slides, readings, and handwritten notes into structured study kits. ' +
    'Stay strictly faithful to the uploaded document without inventing unsupported facts. ' +
    styleDirective;

  const contextLines = [
    `Uploaded File: ${params.fileName}`,
    params.subjectName ? `Subject / Course: ${params.subjectName}` : '',
    params.customInstructions ? `Student Focus Request: ${params.customInstructions}` : '',
    'Transform this study material into structured notes, key takeaways, active-recall flashcards, and concrete follow-up study tasks.',
  ]
    .filter(Boolean)
    .join('\n');

  // Text-based documents (.txt, .md, .csv)
  if (
    ext === 'txt' ||
    ext === 'md' ||
    ext === 'markdown' ||
    ext === 'csv' ||
    mime.startsWith('text/')
  ) {
    const textContent = params.buffer.toString('utf-8').trim();
    if (!textContent) {
      throw new Error('The uploaded text document appears to be empty.');
    }
    const structured = await generateStructuredNotesFromText({
      sourceText: textContent,
      sourceTitle: params.fileName.replace(/\.[^.]+$/, ''),
      noteStyle,
      subjectName: params.subjectName,
      customInstructions: params.customInstructions,
    });
    return { ...structured, extractedPreview: textContent.slice(0, 20000) };
  }

  // Word DOCX documents
  if (
    ext === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const extracted = await mammoth.extractRawText({ buffer: params.buffer });
    const textContent = (extracted.value || '').trim();
    if (!textContent) {
      throw new Error('Could not extract readable text from this Word (.docx) document.');
    }
    const structured = await generateStructuredNotesFromText({
      sourceText: textContent,
      sourceTitle: params.fileName.replace(/\.[^.]+$/, ''),
      noteStyle,
      subjectName: params.subjectName,
      customInstructions: params.customInstructions,
    });
    return { ...structured, extractedPreview: textContent.slice(0, 20000) };
  }

  // Multimodal native Gemini inputs: PDF and images (PNG, JPEG, WEBP)
  const supportedMultimodalMime =
    ext === 'pdf' || mime === 'application/pdf'
      ? 'application/pdf'
      : ext === 'png' || mime === 'image/png'
        ? 'image/png'
        : ext === 'webp' || mime === 'image/webp'
          ? 'image/webp'
          : ext === 'jpg' || ext === 'jpeg' || mime === 'image/jpeg'
            ? 'image/jpeg'
            : null;

  if (!supportedMultimodalMime) {
    throw new Error(
      `Unsupported file format (${ext || mime || 'unknown'}). Please upload PDF, DOCX, TXT, MD, CSV, PNG, JPG, or WEBP files.`
    );
  }

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: supportedMultimodalMime,
              data: params.buffer.toString('base64'),
            },
          },
          { text: contextLines },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: STRUCTURED_NOTE_SCHEMA,
      },
    })
  );

  const jsonStr = (response.text ?? '{}').trim();
  const parsed = JSON.parse(jsonStr);
  const structured = sanitizeStructuredNote(parsed, params.fileName.replace(/\.[^.]+$/, ''));
  return { ...structured, extractedPreview: '' };
}

/**
 * Generate fresh flashcards for an existing note
 */
export async function generateFlashcardsForNote(params: {
  title: string;
  content: string;
  transcript?: string;
  count?: number;
}): Promise<GeneratedFlashcard[]> {
  const ai = getClient();
  const targetCount = Math.min(Math.max(params.count || 6, 3), 15);

  const combinedSource = [
    `Title: ${params.title}`,
    params.content ? `Study Notes:\n${params.content.slice(0, 40000)}` : '',
    params.transcript ? `Lecture Transcript:\n${params.transcript.slice(0, 40000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Create ${targetCount} high-yield active-recall flashcards based strictly on the material below.\n\n${combinedSource}`,
      config: {
        systemInstruction:
          'You create crisp, memorable active-recall flashcards for university and high-school students. Keep questions focused and answers accurate and concise.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              front: { type: Type.STRING },
              back: { type: Type.STRING },
            },
            required: ['front', 'back'],
          },
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '[]').trim());
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (c): c is { front: string; back: string } =>
        Boolean(c) && typeof c.front === 'string' && typeof c.back === 'string' && c.front.trim().length > 0 && c.back.trim().length > 0
    )
    .map((c) => ({
      front: c.front.trim().slice(0, 480),
      back: c.back.trim().slice(0, 950),
    }))
    .slice(0, 20);
}

/**
 * Grounded study Q&A strictly over the open note & transcript
 */
export async function askQuestionAboutNote(params: {
  noteTitle: string;
  noteContent: string;
  transcript?: string;
  question: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<string> {
  const ai = getClient();
  const contextBlock = [
    `Note Title: ${params.noteTitle}`,
    params.noteContent ? `Study Notes:\n${params.noteContent.slice(0, 45000)}` : '',
    params.transcript ? `Lecture Transcript:\n${params.transcript.slice(0, 45000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const historyLines = (params.history || [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Notevox'}: ${m.text}`)
    .join('\n');

  const prompt = [
    contextBlock,
    historyLines ? `Recent Conversation:\n${historyLines}` : '',
    `Student Question: ${params.question}`,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are Notevox, a helpful, clear study tutor. Answer the student question using the provided note and lecture transcript as your primary source. ' +
          'If a detail is not covered in the note, say so honestly before offering a brief helpful clarification. Use clear Markdown formatting.',
      },
    })
  );

  return (response.text ?? '').trim();
}

/**
 * Convert a note summary into spoken WAV audio using gemini-3.8-flash-lite-tts
 */
export async function synthesizeNoteSummaryAudio(text: string, voiceName = 'Kore'): Promise<string> {
  const ai = getClient();
  const safeText = text.trim().slice(0, 2500);
  if (!safeText) {
    throw new Error('No summary text available to read aloud.');
  }
  const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
  const selectedVoice = allowedVoices.includes(voiceName) ? voiceName : 'Kore';

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: safeText,
              speechMetadata: {
                style: 'Warm, articulate, friendly study narrator speaking at a steady pace',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice },
          },
        },
      },
    })
  );

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Audio narration could not be generated for this note.');
  }
  return base64Audio;
}
