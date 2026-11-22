import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  FileAudio,
  Loader2,
  Mic,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Upload,
} from 'lucide-react';
import { useNotevox } from '../context/NotevoxContext';
import { transcribeAudioApi } from '../lib/api';
import { NOTEVOX_ASSETS } from '../lib/assets';
import {
  formatDuration,
  formatDurationHuman,
  formatTimestampDate,
  NOTE_STYLE_META,
} from '../lib/palette';
import type { NoteStyle, StructuredNoteResponse } from '../types';
import { IllustrationFrame } from './IllustrationFrame';

interface LectureStudioViewProps {
  onOpenNote: (noteId: string) => void;
}

type StudioMode = 'record' | 'upload';
type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';

const SPECTRUM_PALETTE = ['#F4A6C6', '#FFD45C', '#83D66F', '#62B8F5', '#C9B6F5'];

export function LectureStudioView({ onOpenNote }: LectureStudioViewProps) {
  const { subjects, notes, createNote, createTask } = useNotevox();

  const [mode, setMode] = useState<StudioMode>('record');
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');
  const [audioDurationSec, setAudioDurationSec] = useState<number>(0);

  // Lecture details & AI options
  const [lectureTitle, setLectureTitle] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [noteStyle, setNoteStyle] = useState<NoteStyle>('structured');
  const [generateStructuredNotes, setGenerateStructuredNotes] = useState(true);

  // Processing & output state
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    noteId: string;
    transcript: string;
    structured?: StructuredNoteResponse;
  } | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [addedTasks, setAddedTasks] = useState<Record<number, boolean>>({});

  // MediaRecorder + Web Audio spectrum refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const idleAnimRef = useRef<number | null>(null);
  const peaksRef = useRef<number[]>(new Array(44).fill(0));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const audioLectures = notes.filter((n) => n.sourceType === 'audio');
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  // Clean up streams and URLs on unmount
  useEffect(() => {
    return () => {
      stopMediaPipeline();
      if (idleAnimRef.current) cancelAnimationFrame(idleAnimRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopMediaPipeline() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setInputLevel(0);
  }

  function drawOscilloscopeBackdrop(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;

    // Horizontal reference lines
    for (const frac of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(0, height * frac);
      ctx.lineTo(width, height * frac);
      ctx.stroke();
    }
  }

  // Calm breathing studio spectrum while in standby/paused/stopped mode
  useEffect(() => {
    if (mode !== 'record' || recordingStatus === 'recording') {
      if (idleAnimRef.current) {
        cancelAnimationFrame(idleAnimRef.current);
        idleAnimRef.current = null;
      }
      return;
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let phase = 0;
    const barCount = 44;

    const drawFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height } = canvas;
      drawOscilloscopeBackdrop(ctx, width, height);

      const gap = 5;
      const barWidth = Math.max(4, (width - 28 - gap * (barCount - 1)) / barCount);
      const startX = 14;
      const midY = height / 2;

      for (let i = 0; i < barCount; i++) {
        const normPos = i / (barCount - 1);
        const envelope = Math.sin(normPos * Math.PI);
        const wave = Math.sin(i * 0.34 + phase) * 0.5 + 0.5;
        const halfH = Math.max(4, (8 + wave * 20) * (0.45 + envelope * 0.55));
        const x = startX + i * (barWidth + gap);
        const color = SPECTRUM_PALETTE[Math.floor((i / barCount) * SPECTRUM_PALETTE.length)];

        ctx.fillStyle = color;
        ctx.globalAlpha = recordingStatus === 'stopped' ? 0.55 : 0.38;
        ctx.beginPath();
        ctx.roundRect(x, midY - halfH, barWidth, halfH * 2, 3);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!prefersReduced) {
        phase += 0.035;
        idleAnimRef.current = requestAnimationFrame(drawFrame);
      }
    };

    drawFrame();

    return () => {
      if (idleAnimRef.current) {
        cancelAnimationFrame(idleAnimRef.current);
        idleAnimRef.current = null;
      }
    };
  }, [mode, recordingStatus]);

  function startWaveformLoop() {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const barCount = 44;
    peaksRef.current = new Array(barCount).fill(0);
    let meterFrame = 0;

    const render = () => {
      analyser.getByteFrequencyData(dataArray);
      const { width, height } = canvas;
      drawOscilloscopeBackdrop(ctx, width, height);

      const gap = 5;
      const barWidth = Math.max(4, (width - 28 - gap * (barCount - 1)) / barCount);
      const startX = 14;
      const midY = height / 2;
      const step = Math.max(1, Math.floor((dataArray.length * 0.72) / barCount));

      let sumEnergy = 0;

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] || 0;
        sumEnergy += value;
        const normalized = Math.min(1, (value / 255) * 1.18);
        const halfH = Math.max(5, normalized * (midY - 14));

        // Update peak-hold caps smoothly
        if (halfH > peaksRef.current[i]) {
          peaksRef.current[i] = halfH;
        } else {
          peaksRef.current[i] = Math.max(halfH, peaksRef.current[i] - 0.85);
        }

        const x = startX + i * (barWidth + gap);
        const color = SPECTRUM_PALETTE[Math.floor((i / barCount) * SPECTRUM_PALETTE.length)];

        // Glowing mirrored spectrum bar
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = normalized > 0.25 ? 10 : 0;
        ctx.beginPath();
        ctx.roundRect(x, midY - halfH, barWidth, halfH * 2, 3);
        ctx.fill();
        ctx.restore();

        // Crisp peak-hold floating caps (top + bottom)
        if (peaksRef.current[i] > 8) {
          ctx.fillStyle = 'rgba(255, 253, 248, 0.85)';
          ctx.fillRect(x, midY - peaksRef.current[i] - 4, barWidth, 2);
          ctx.fillRect(x, midY + peaksRef.current[i] + 2, barWidth, 2);
        }
      }

      // Throttle React dB level bar updates to ~15fps
      meterFrame += 1;
      if (meterFrame % 4 === 0) {
        const avgLevel = Math.min(12, Math.round((sumEnergy / (barCount * 255)) * 18));
        setInputLevel(avgLevel);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();
  }

  async function startRecording() {
    setError(null);
    setResult(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'Microphone recording is not available in this browser context. You can upload an audio lecture file instead.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      analyserRef.current = analyser;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg',
      ];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const ext = finalMime.includes('mp4')
          ? 'm4a'
          : finalMime.includes('ogg')
            ? 'ogg'
            : 'webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setAudioFileName(`lecture-recording.${ext}`);
        setRecordingStatus('stopped');
        stopMediaPipeline();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setElapsedSec(0);
      setAudioDurationSec(0);
      setAudioBlob(null);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      setRecordingStatus('recording');

      timerRef.current = window.setInterval(() => {
        setElapsedSec((prev) => {
          const next = prev + 1;
          setAudioDurationSec(next);
          return next;
        });
      }, 1000);

      startWaveformLoop();
    } catch (err) {
      stopMediaPipeline();
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('permission')) {
        setError(
          'Microphone permission was denied. Allow microphone access in your browser bar, or switch to "Upload Audio" to transcribe an existing recording.'
        );
      } else {
        setError(`Could not access microphone: ${msg}`);
      }
    }
  }

  function togglePauseRecording() {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (recordingStatus === 'recording') {
      rec.pause();
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setInputLevel(0);
      setRecordingStatus('paused');
    } else if (recordingStatus === 'paused') {
      rec.resume();
      timerRef.current = window.setInterval(() => {
        setElapsedSec((prev) => {
          const next = prev + 1;
          setAudioDurationSec(next);
          return next;
        });
      }, 1000);
      setRecordingStatus('recording');
      startWaveformLoop();
    }
  }

  function stopRecording() {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
  }

  function resetAudioSelection() {
    stopMediaPipeline();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioFileName('');
    setElapsedSec(0);
    setAudioDurationSec(0);
    setRecordingStatus('idle');
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFilePicked(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    if (file.size > 25 * 1024 * 1024) {
      setError('Audio file is larger than 25MB. Please compress or split it before uploading.');
      return;
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(file);
    setAudioBlob(file);
    setAudioUrl(url);
    setAudioFileName(file.name);
    setAudioDurationSec(0);
    if (!lectureTitle.trim()) {
      setLectureTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setMode('upload');
      handleFilePicked(dropped);
    }
  }

  async function handleTranscribe() {
    if (!audioBlob) {
      setError('Record a lecture or select an audio file first.');
      return;
    }
    setError(null);
    setResult(null);
    setAddedTasks({});
    setProcessingStage(
      generateStructuredNotes
        ? 'Transcribing speech & building AI study notes...'
        : 'Converting lecture audio into text...'
    );

    const subjectObj = selectedSubjectId ? subjectMap.get(selectedSubjectId) : undefined;
    const effectiveTitle =
      lectureTitle.trim() ||
      (audioFileName ? audioFileName.replace(/\.[^.]+$/, '') : 'Recorded Lecture');

    try {
      const response = await transcribeAudioApi({
        audioBlob,
        fileName: audioFileName || 'lecture.webm',
        generateNotes: generateStructuredNotes,
        noteStyle,
        title: effectiveTitle,
        subjectName: subjectObj?.name,
      });

      setProcessingStage('Saving transcript and study kit to your library...');

      const finalTitle = response.note?.title || effectiveTitle;
      const finalContent =
        response.note?.content || `## Lecture Transcript\n\n${response.transcript}`;

      const noteId = await createNote({
        title: finalTitle,
        subjectId: selectedSubjectId,
        sourceType: 'audio',
        noteStyle,
        sourceFileName: audioFileName || 'lecture.webm',
        audioDurationSec,
        summary: response.note?.summary || '',
        content: finalContent,
        transcript: response.transcript,
        keyTakeaways: response.note?.keyTakeaways || [],
        flashcards: response.note?.flashcards || [],
      });

      setResult({
        noteId,
        transcript: response.transcript,
        structured: response.note,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to transcribe audio right now. Please try again.'
      );
    } finally {
      setProcessingStage(null);
    }
  }

  async function handleCopyTranscript() {
    if (!result?.transcript) return;
    try {
      await navigator.clipboard.writeText(result.transcript);
      setCopiedTranscript(true);
      window.setTimeout(() => setCopiedTranscript(false), 1800);
    } catch {
      // Clipboard blocked
    }
  }

  async function handleAddSuggestedTask(
    index: number,
    title: string,
    priority: 'low' | 'medium' | 'high'
  ) {
    if (!result) return;
    await createTask({
      title,
      priority,
      subjectId: selectedSubjectId,
      noteId: result.noteId,
    });
    setAddedTasks((prev) => ({ ...prev, [index]: true }));
  }

  return (
    <div className="space-y-8">
      {/* Studio Workspace Grid */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Capture / Upload Audio Stage */}
        <div className="xl:col-span-7 nv-studio-card rounded-2xl p-6 sm:p-7 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#1C1926]">Lecture Audio &amp; Speech-to-Text</h2>
              <p className="text-xs text-[#5C566C] mt-0.5">
                Record live classes on the studio deck or upload audio files to transcribe.
              </p>
            </div>

            {/* Mode Segmented Switch */}
            <div className="inline-flex items-center p-1 rounded-xl bg-[#F3EEE2] border border-[#E8E0D0]">
              <button
                type="button"
                onClick={() => {
                  if (recordingStatus === 'recording' || recordingStatus === 'paused') return;
                  setMode('record');
                  setError(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'record'
                    ? 'bg-white text-[#1C1926] shadow-xs'
                    : 'text-[#5C566C] hover:text-[#1C1926]'
                }`}
              >
                Live Recorder
              </button>
              <button
                type="button"
                onClick={() => {
                  if (recordingStatus === 'recording' || recordingStatus === 'paused') return;
                  setMode('upload');
                  setError(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'upload'
                    ? 'bg-white text-[#1C1926] shadow-xs'
                    : 'text-[#5C566C] hover:text-[#1C1926]'
                }`}
              >
                Upload Audio
              </button>
            </div>
          </div>

          {mode === 'record' ? (
            /* Obsidian Studio Hardware Console Deck */
            <div className="nv-hardware-deck rounded-2xl overflow-hidden text-[#FFFDF8]">
              <div className="h-1 w-full nv-spectrum-bar" aria-hidden="true" />
              <div className="p-5 sm:p-6 space-y-5">
                {/* Hardware Top Telemetry Row */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs font-mono">
                    {recordingStatus === 'recording' ? (
                      <span className="inline-flex items-center gap-2 text-[#F4A6C6] font-bold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FF4D79] animate-pulse" />
                        REC · LIVE MIC
                      </span>
                    ) : recordingStatus === 'paused' ? (
                      <span className="inline-flex items-center gap-2 text-[#FFD45C] font-bold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FFD45C]" />
                        PAUSED
                      </span>
                    ) : recordingStatus === 'stopped' && audioBlob ? (
                      <span className="inline-flex items-center gap-2 text-[#83D66F] font-bold">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#83D66F]" />
                        CAPTURED · READY
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-[#B7B0C9]">
                        <span className="w-2 h-2 rounded-full bg-white/25" />
                        NOTEVOX AUDIO DECK · STANDBY
                      </span>
                    )}
                  </div>

                  {/* Real-Time 12-Segment LED dB Level Meter + Timer */}
                  <div className="flex items-center gap-4">
                    <div
                      className="hidden sm:flex items-center gap-1"
                      aria-label="Live microphone input level"
                    >
                      <span className="text-[10px] font-mono text-[#8E879E] mr-1">IN</span>
                      {Array.from({ length: 12 }).map((_, idx) => {
                        const lit = idx < inputLevel;
                        const color =
                          idx >= 9 ? 'bg-[#F4A6C6]' : idx >= 6 ? 'bg-[#FFD45C]' : 'bg-[#83D66F]';
                        return (
                          <span
                            key={idx}
                            className={`w-1.5 h-3.5 rounded-[2px] transition-colors ${
                              lit ? color : 'bg-white/10'
                            }`}
                          />
                        );
                      })}
                    </div>
                    <div className="text-2xl font-mono font-bold tabular-nums text-[#FFFDF8]">
                      {formatDuration(elapsedSec)}
                    </div>
                  </div>
                </div>

                {/* Mirrored Dual-Sided Glowing Rainbow Spectrum Canvas */}
                <div className="rounded-xl bg-[#0F0D18] border border-white/10 p-2">
                  <canvas
                    ref={canvasRef}
                    width={720}
                    height={144}
                    className="w-full h-32 block"
                    aria-label="Live audio spectrum visualizer"
                  />
                </div>

                {/* Tactile Hardware Transport Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {recordingStatus === 'idle' && (
                      <button
                        type="button"
                        onClick={() => void startRecording()}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#62B8F5] text-[#1C1926] text-xs sm:text-sm font-bold hover:bg-[#4FA9EB] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Mic className="w-4 h-4" />
                        Start Recording
                      </button>
                    )}

                    {(recordingStatus === 'recording' || recordingStatus === 'paused') && (
                      <>
                        <button
                          type="button"
                          onClick={togglePauseRecording}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFD45C] text-[#1C1926] text-xs sm:text-sm font-bold hover:bg-[#F5C642] transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {recordingStatus === 'recording' ? (
                            <>
                              <Pause className="w-4 h-4" />
                              Pause
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4" />
                              Resume
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FFFDF8] text-[#1C1926] text-xs sm:text-sm font-bold hover:bg-[#EFE9DC] transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <Square className="w-3.5 h-3.5" />
                          Stop &amp; Review
                        </button>
                      </>
                    )}

                    {recordingStatus === 'stopped' && audioBlob && (
                      <button
                        type="button"
                        onClick={resetAudioSelection}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-[#FFFDF8] text-xs font-semibold hover:bg-white/15 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Record Again
                      </button>
                    )}
                  </div>

                  <span className="text-[11px] font-mono text-[#8E879E]">
                    OPUS · 48KHZ · SPEECH AI
                  </span>
                </div>

                {audioUrl && recordingStatus === 'stopped' && (
                  <div className="pt-2 border-t border-white/10">
                    <audio controls src={audioUrl} className="w-full h-10" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="rounded-2xl bg-[#FFFDF8] border-2 border-dashed border-[#D8CEBB] hover:border-[#62B8F5] transition-colors p-8 text-center space-y-4"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.flac,.aac"
                onChange={(e) => handleFilePicked(e.target.files?.[0])}
                className="hidden"
                id="audio-upload-input"
              />
              <div className="w-12 h-12 rounded-2xl bg-[#EEF7FE] text-[#145585] mx-auto flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>

              {audioBlob && audioFileName ? (
                <div className="space-y-3">
                  <div className="text-sm font-bold text-[#1C1926]">{audioFileName}</div>
                  <div className="text-xs text-[#5C566C] tabular-nums">
                    {(audioBlob.size / (1024 * 1024)).toFixed(2)} MB
                    {audioDurationSec > 0 ? ` · ${formatDurationHuman(audioDurationSec)}` : ''}
                  </div>
                  {audioUrl && (
                    <audio
                      controls
                      src={audioUrl}
                      onLoadedMetadata={(e) => {
                        const dur = e.currentTarget.duration;
                        if (Number.isFinite(dur)) setAudioDurationSec(Math.round(dur));
                      }}
                      className="w-full max-w-md mx-auto h-10"
                    />
                  )}
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <label
                      htmlFor="audio-upload-input"
                      className="px-4 py-2 rounded-xl bg-white border border-[#E5DCCB] text-xs font-semibold text-[#1C1926] hover:bg-[#F7F2E7] cursor-pointer"
                    >
                      Choose Different File
                    </label>
                    <button
                      type="button"
                      onClick={resetAudioSelection}
                      className="px-3 py-2 text-xs font-medium text-[#5C566C] hover:text-[#1C1926] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-bold text-[#1C1926]">
                      Drop your lecture audio here
                    </div>
                    <p className="text-xs text-[#5C566C] mt-1">
                      Supports MP3, WAV, M4A, WebM, OGG, AAC, and FLAC up to 25MB
                    </p>
                  </div>
                  <label
                    htmlFor="audio-upload-input"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#62B8F5] text-[#1C1926] text-xs font-bold hover:bg-[#4FA9EB] transition-colors cursor-pointer"
                  >
                    <FileAudio className="w-4 h-4" />
                    Browse Audio File
                  </label>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-[#FDF2F7] border border-[#F2C6D8] flex items-start gap-3 text-sm text-[#8E2050]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right 5 cols: Lecture Metadata, AI Settings & Transcribe Action */}
        <div className="xl:col-span-5 nv-studio-card rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-bold text-[#1C1926]">Transcription &amp; Note Settings</h3>
            <p className="text-xs text-[#5C566C] mt-0.5">
              Organize this recording before converting speech to text.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="lecture-title"
                className="block text-xs font-semibold text-[#1C1926] mb-1.5"
              >
                Lecture Title (optional)
              </label>
              <input
                id="lecture-title"
                type="text"
                maxLength={160}
                value={lectureTitle}
                onChange={(e) => setLectureTitle(e.target.value)}
                placeholder="e.g., Week 6 — Cellular Respiration"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm text-[#1C1926] placeholder:text-[#8E879E] focus:border-[#1C1926] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="lecture-subject"
                className="block text-xs font-semibold text-[#1C1926] mb-1.5"
              >
                Subject
              </label>
              <select
                id="lecture-subject"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFFDF8] border border-[#E5DCCB] text-sm text-[#1C1926] focus:border-[#1C1926] focus:outline-none"
              >
                <option value="">General / Unassigned</option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                    {sub.code ? ` (${sub.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#F8F4EA] border border-[#EAE3D5] cursor-pointer">
              <input
                type="checkbox"
                checked={generateStructuredNotes}
                onChange={(e) => setGenerateStructuredNotes(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#1C1926]"
              />
              <span className="text-xs leading-relaxed text-[#1C1926]">
                <strong className="block font-semibold">
                  Also generate structured AI study notes &amp; flashcards
                </strong>
                <span className="text-[#5C566C]">
                  Turns the raw speech-to-text transcript into clean headings, summary, takeaways,
                  and flip cards.
                </span>
              </span>
            </label>

            {generateStructuredNotes && (
              <div>
                <span className="block text-xs font-semibold text-[#1C1926] mb-1.5">
                  Note Format
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(NOTE_STYLE_META) as NoteStyle[]).map((styleKey) => {
                    const active = noteStyle === styleKey;
                    return (
                      <button
                        key={styleKey}
                        type="button"
                        onClick={() => setNoteStyle(styleKey)}
                        className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#FFF9E5] border-[#1C1926] text-[#1C1926]'
                            : 'bg-[#FFFDF8] border-[#E8E0D0] text-[#5C566C] hover:border-[#C9C1B0]'
                        }`}
                      >
                        <div className="text-xs font-semibold text-[#1C1926]">
                          {NOTE_STYLE_META[styleKey].label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleTranscribe()}
              disabled={!audioBlob || Boolean(processingStage)}
              className="w-full py-3.5 px-5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-sm font-bold hover:bg-[#312C42] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {processingStage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#62B8F5]" />
                  <span>{processingStage}</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-[#62B8F5]" />
                  <span>
                    {generateStructuredNotes
                      ? 'Transcribe & Build Study Notes'
                      : 'Convert Audio to Text'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Live Result Panel right after transcription */}
      {result && (
        <section className="nv-studio-card border-[#83D66F] rounded-2xl p-6 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#F0E9DC]">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-[#83D66F] text-[#1C1926] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-[#1C1926]">
                  {result.structured?.title || lectureTitle || 'Lecture Transcribed & Saved'}
                </h3>
                <p className="text-xs text-[#5C566C]">
                  Saved to your Notevox library · Speech-to-text complete
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleCopyTranscript()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F7F2E7] border border-[#E5DCCB] text-xs font-semibold text-[#1C1926] hover:bg-[#EFE9DC] cursor-pointer"
              >
                {copiedTranscript ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedTranscript ? 'Copied' : 'Copy Transcript'}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenNote(result.noteId)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-xs font-semibold hover:bg-[#312C42] cursor-pointer"
              >
                <span>Open Full Study Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-2">
              <div className="text-xs font-semibold text-[#5C566C]">Speech-to-Text Transcript</div>
              <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#EAE3D5] text-sm text-[#2A2638] leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap">
                {result.transcript}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              {result.structured?.summary && (
                <div>
                  <div className="text-xs font-semibold text-[#5C566C] mb-1.5">AI Summary</div>
                  <p className="text-sm text-[#2A2638] leading-relaxed">
                    {result.structured.summary}
                  </p>
                </div>
              )}

              {result.structured && result.structured.suggestedTasks.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-[#5C566C] mb-2">
                    Suggested Follow-Up Study Tasks
                  </div>
                  <div className="space-y-2">
                    {result.structured.suggestedTasks.map((task, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#FFFDF8] border border-[#EAE3D5] text-xs"
                      >
                        <span className="text-[#1C1926] font-medium">{task.title}</span>
                        <button
                          type="button"
                          disabled={addedTasks[idx]}
                          onClick={() =>
                            void handleAddSuggestedTask(idx, task.title, task.priority)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FFD45C] text-[#1C1926] font-semibold hover:bg-[#F5C642] disabled:bg-[#F0FAED] disabled:text-[#226119] whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {addedTasks[idx] ? (
                            <>
                              <Check className="w-3 h-3" />
                              Added
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              Add Task
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Transcribed Audio Lectures Library */}
      <section className="nv-studio-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-[#1C1926]">Recorded &amp; Uploaded Lectures</h3>
            <p className="text-xs text-[#5C566C] mt-0.5 tabular-nums">
              {audioLectures.length} {audioLectures.length === 1 ? 'lecture' : 'lectures'} in your
              archive
            </p>
          </div>
        </div>

        {audioLectures.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center py-3">
            <div className="md:col-span-5">
              <IllustrationFrame
                src={NOTEVOX_ASSETS.audioStudio}
                alt="Matte pocket lecture recorder with multicolor glowing audio spectrum"
                fallbackType="audio"
                className="aspect-[16/10] w-full"
              />
            </div>
            <div className="md:col-span-7 space-y-2.5">
              <h4 className="text-lg font-bold text-[#1C1926]">No transcribed lectures yet</h4>
              <p className="text-sm text-[#5C566C] max-w-xl leading-relaxed">
                Start recording on the audio deck above or upload an audio memo, seminar, or
                professor&apos;s lecture. Every transcript and AI-generated study sheet will stay
                neatly indexed here by subject.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#F0E9DC]">
            {audioLectures.map((lecture) => {
              const subj = lecture.subjectId ? subjectMap.get(lecture.subjectId) : undefined;
              return (
                <button
                  key={lecture.id}
                  type="button"
                  onClick={() => onOpenNote(lecture.id)}
                  className="w-full py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4 text-left hover:bg-[#FFFDF8] px-2 -mx-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[#1C1926] truncate">
                      {lecture.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5C566C] mt-1">
                      {subj && (
                        <>
                          <span className="font-medium text-[#1C1926]">{subj.name}</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      {lecture.audioDurationSec > 0 && (
                        <>
                          <span className="tabular-nums">
                            {formatDurationHuman(lecture.audioDurationSec)}
                          </span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span className="tabular-nums">{lecture.wordCount} words</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatTimestampDate(lecture.createdAt)}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#7B748C] shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
