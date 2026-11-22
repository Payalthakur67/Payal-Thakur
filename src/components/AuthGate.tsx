import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CheckSquare, Download, FileText, Layers, Mic } from 'lucide-react';
import { useNotevox } from '../context/NotevoxContext';
import { NOTEVOX_ASSETS } from '../lib/assets';
import { IllustrationFrame } from './IllustrationFrame';
import { NotevoxLogo } from './NotevoxLogo';

const FORMAT_TILES = [
  { ext: 'PDF', color: 'bg-[#F4A6C6]' },
  { ext: 'DOCX', color: 'bg-[#62B8F5]' },
  { ext: 'MP3', color: 'bg-[#83D66F]' },
  { ext: 'WAV', color: 'bg-[#FFD45C]' },
  { ext: 'SLIDES', color: 'bg-[#C9B6F5]' },
  { ext: 'MD', color: 'bg-[#F4A6C6]' },
];

export function AuthGate() {
  const { signInWithGoogle, authError } = useNotevox();
  const [signingIn, setSigningIn] = useState(false);

  async function handleSignIn() {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="min-h-screen nv-dot-canvas text-[#1C1926] flex flex-col">
      {/* Crisp 4px Notevox 5-color studio spectrum strip */}
      <div className="h-1 w-full nv-spectrum-bar shrink-0" aria-hidden="true" />

      {/* Strict 3-zone Top Bar Contract */}
      <header className="w-full max-w-[1240px] mx-auto px-6 py-5 flex items-center justify-between gap-8 border-b border-[#EAE3D5]/90">
        <NotevoxLogo size="md" />
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#5C566C]">
          <a
            href="#workflow"
            className="hover:text-[#1C1926] transition-colors whitespace-nowrap shrink-0"
          >
            Workspace
          </a>
          <a
            href="#lecture-audio"
            className="hover:text-[#1C1926] transition-colors whitespace-nowrap shrink-0"
          >
            Lecture Audio
          </a>
          <a
            href="#planner"
            className="hover:text-[#1C1926] transition-colors whitespace-nowrap shrink-0"
          >
            Study Planner
          </a>
        </nav>
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="px-4 py-2.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-sm font-semibold hover:bg-[#312C42] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
          >
            {signingIn ? 'Opening Google...' : 'Sign in'}
          </button>
        </div>
      </header>

      {/* Main Split Hero */}
      <main className="flex-1 w-full max-w-[1240px] mx-auto px-6 py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 flex flex-col justify-center"
          >
            <div className="inline-flex items-center gap-2.5 mb-4">
              <span className="h-2.5 w-10 rounded-full nv-spectrum-bar" aria-hidden="true" />
              <p className="text-xs font-bold uppercase tracking-wider text-[#8E2050]">
                Your Knowledge. Your Way.
              </p>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.06] text-[#1C1926] mb-5">
              Turn lectures and readings into study clarity.
            </h1>
            <p className="text-base sm:text-lg text-[#5C566C] leading-relaxed max-w-xl mb-8">
              Record live classes or upload audio, PDFs, slides, and docs. Notevox transcribes your
              lectures, builds structured notes and 3D flashcards, and syncs every subject and
              deadline to your private account.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
              <motion.button
                type="button"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleSignIn}
                disabled={signingIn}
                className="inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-[#1C1926] text-[#FFFDF8] text-sm sm:text-base font-semibold hover:bg-[#302B40] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer shadow-md"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12z"
                  />
                </svg>
                <span>{signingIn ? 'Connecting with Google...' : 'Continue with Google'}</span>
                <ArrowRight className="w-4 h-4 text-[#FFD45C]" />
              </motion.button>
              <span className="text-xs text-[#5C566C]">
                Private Firestore sync · Starts clean with your real data
              </span>
            </div>

            {authError && (
              <div className="p-3.5 rounded-xl bg-[#FDF2F7] border border-[#F2C6D8] text-sm text-[#8E2050] max-w-xl">
                {authError}
              </div>
            )}
          </motion.div>

          {/* Cool Studio Hardware Framed Hero Art */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6"
          >
            <div className="nv-hardware-deck p-2.5 sm:p-3 rounded-[26px]">
              <IllustrationFrame
                src={NOTEVOX_ASSETS.heroStudio}
                alt="Notevox matte obsidian study synthesizer projecting pastel light onto geometric study sheets"
                fallbackType="notes"
                className="aspect-[16/10] w-full rounded-[18px] border-white/10"
              />
              <div className="mt-2.5 px-2 pb-0.5 flex items-center justify-between text-[11px] font-mono text-[#C8C3D6]">
                <span>NOTEVOX STUDIO · MK II</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#F4A6C6]" />
                  <span className="w-2 h-2 rounded-full bg-[#FFD45C]" />
                  <span className="w-2 h-2 rounded-full bg-[#83D66F]" />
                  <span className="w-2 h-2 rounded-full bg-[#62B8F5]" />
                  <span className="w-2 h-2 rounded-full bg-[#C9B6F5]" />
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Vibrant 3-Feature Neo-Pop Bento Strip */}
        <section id="workflow" className="mt-16 pt-12 border-t border-[#EAE3D5]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.article
              id="lecture-audio"
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              className="nv-studio-card rounded-2xl overflow-hidden flex flex-col justify-between"
            >
              <div className="h-1.5 w-full bg-[#62B8F5]" aria-hidden="true" />
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#62B8F5] text-[#1C1926] flex items-center justify-center mb-4">
                    <Mic className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold text-[#1C1926] mb-2">
                    Live Lecture Studio &amp; Speech-to-Text
                  </h2>
                  <p className="text-sm text-[#5C566C] leading-relaxed mb-5">
                    Capture live classes on a glowing spectrum console or upload recorded seminars.
                    Convert speech into clean transcripts and structured notes in one workflow.
                  </p>
                </div>
                <IllustrationFrame
                  src={NOTEVOX_ASSETS.audioStudio}
                  alt="Matte pocket lecture recorder with multicolor glowing audio spectrum"
                  fallbackType="audio"
                  className="aspect-[16/10] w-full"
                />
              </div>
            </motion.article>

            <motion.article
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              className="nv-studio-card rounded-2xl overflow-hidden flex flex-col justify-between"
            >
              <div className="h-1.5 w-full bg-[#F4A6C6]" aria-hidden="true" />
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#F4A6C6] text-[#1C1926] flex items-center justify-center mb-4">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold text-[#1C1926] mb-2">
                    AI Study Kits &amp; 3D Flashcards
                  </h2>
                  <p className="text-sm text-[#5C566C] leading-relaxed mb-5">
                    Drop in PDFs, Word documents, Markdown readings, or whiteboard photos. Generate
                    Cornell notes, revision sheets, flip-deck flashcards, and spoken recaps.
                  </p>
                </div>

                {/* Tactile Hardware Format Matrix */}
                <div className="nv-hardware-deck rounded-2xl p-4 text-[#FFFDF8] space-y-3.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#B7B0C9]">
                    <span>SUPPORTED INPUTS</span>
                    <Layers className="w-3.5 h-3.5 text-[#F4A6C6]" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {FORMAT_TILES.map((tile) => (
                      <div
                        key={tile.ext}
                        className="rounded-lg bg-white/8 border border-white/10 px-2.5 py-2 flex items-center gap-2"
                      >
                        <span className={`w-2 h-2 rounded-xs shrink-0 ${tile.color}`} />
                        <span className="font-mono text-xs font-bold tracking-wide">{tile.ext}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-[#C8C3D6]">
                    <span>Structured · Cornell · Exam</span>
                    <span className="font-semibold text-[#FFD45C]">Audio Readout</span>
                  </div>
                </div>
              </div>
            </motion.article>

            <motion.article
              id="planner"
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              className="nv-studio-card rounded-2xl overflow-hidden flex flex-col justify-between"
            >
              <div className="h-1.5 w-full bg-[#83D66F]" aria-hidden="true" />
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#83D66F] text-[#1C1926] flex items-center justify-center mb-4">
                    <CheckSquare className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold text-[#1C1926] mb-2">
                    Focus Dial, Subjects &amp; Reminders
                  </h2>
                  <p className="text-sm text-[#5C566C] leading-relaxed mb-5">
                    Organize coursework by color-coded subjects, track upcoming deadlines, run timed
                    focus sessions on your studio dial, and see real 7-day activity trends.
                  </p>
                </div>
                <IllustrationFrame
                  src={NOTEVOX_ASSETS.tasksPlanner}
                  alt="Matte flip-clock focus timer alongside vibrant pastel modular task tiles"
                  fallbackType="tasks"
                  className="aspect-[16/10] w-full"
                />
              </div>
            </motion.article>
          </div>
        </section>
      </main>

      <footer className="w-full max-w-[1240px] mx-auto px-6 py-6 border-t border-[#EAE3D5] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5C566C]">
        <span>Notevox — Your Knowledge. Your Way.</span>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="/api/export/notevox-onefile.mjs"
            download="notevox-onefile.mjs"
            className="inline-flex items-center gap-1.5 font-semibold text-[#1C1926] hover:underline underline-offset-4"
          >
            <Download className="w-3.5 h-3.5" />
            One-File Code (.mjs)
          </a>
          <a
            href="/api/export/notevox-single.html"
            download="notevox-single.html"
            className="font-semibold text-[#4C475C] hover:text-[#1C1926] hover:underline underline-offset-4"
          >
            Single HTML
          </a>
          <a
            href="/api/export/notevox-website.zip"
            download="notevox-website.zip"
            className="font-semibold text-[#4C475C] hover:text-[#1C1926] hover:underline underline-offset-4"
          >
            Website (.zip)
          </a>
          <span>Built for students · Private cloud sync</span>
        </div>
      </footer>
    </div>
  );
}
