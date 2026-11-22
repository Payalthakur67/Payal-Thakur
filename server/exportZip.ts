import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Precompute IEEE 802.3 CRC-32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeDate(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

interface ZipEntryInput {
  name: string;
  data: Buffer;
  mtime: Date;
}

function buildZipBuffer(entries: ZipEntryInput[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const normalizedName = entry.name.replace(/\\/g, '/');
    const nameBuf = Buffer.from(normalizedName, 'utf8');
    const uncompressedSize = entry.data.length;
    const compressedData = zlib.deflateRawSync(entry.data, { level: 6 });
    const compressedSize = compressedData.length;
    const crc = crc32(entry.data);
    const { dosTime, dosDate } = toDosTimeDate(entry.mtime);

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8); // compression method: deflate
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBuf, compressedData);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10); // deflate
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressedData.length;
  }

  const centralDirBuf = Buffer.concat(centralChunks);

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central dir start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, centralDirBuf, eocd]);
}

const ROOT_FILES = [
  '.env.example',
  '.gitignore',
  'eslint.config.mjs',
  'firebase-applet-config.json',
  'firebase-blueprint.json',
  'firestore.rules',
  'index.html',
  'metadata.json',
  'package.json',
  'server.ts',
  'tsconfig.json',
  'vite.config.ts',
];

const SOURCE_DIRS = ['src', 'server'];

// Only bundle active studio image assets referenced by src/lib/assets.ts
const ACTIVE_IMAGE_ASSETS = new Set([
  'hero_notevox_studio_1795175803730.jpg',
  'graphic_audio_wave_1795175802774.jpg',
  'graphic_focus_planner_1795175802695.jpg',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.md',
  '.rules',
  '.example',
  '.svg',
]);

function isTextFile(relPath: string): boolean {
  const base = path.basename(relPath);
  if (base === '.gitignore' || base === '.env.example') return true;
  return TEXT_EXTENSIONS.has(path.extname(relPath).toLowerCase());
}

function collectDirFiles(
  rootDir: string,
  relDir: string,
  entries: { relPath: string; data: Buffer; mtime: Date }[]
) {
  const fullDir = path.join(rootDir, relDir);
  if (!fs.existsSync(fullDir)) return;

  const items = fs.readdirSync(fullDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const item of items) {
    if (
      item.name === 'node_modules' ||
      item.name === 'dist' ||
      item.name === '.git' ||
      item.name === '.DS_Store' ||
      item.name.startsWith('.env') ||
      item.name.endsWith('.log') ||
      item.name.endsWith('.sqlite') ||
      item.name.endsWith('.db')
    ) {
      continue;
    }

    const relPath = path.posix.join(relDir, item.name);
    const fullPath = path.join(fullDir, item.name);

    if (
      relDir === 'src/assets/images' &&
      item.isFile() &&
      !ACTIVE_IMAGE_ASSETS.has(item.name)
    ) {
      continue;
    }

    if (item.isDirectory()) {
      collectDirFiles(rootDir, relPath, entries);
    } else if (item.isFile()) {
      const stat = fs.statSync(fullPath);
      entries.push({
        relPath,
        data: fs.readFileSync(fullPath),
        mtime: stat.mtime,
      });
    }
  }
}

const SETUP_README = `# Notevox — Full Website Source Package

Your Knowledge. Your Way.

## Quick Local Setup

1. Install Node.js 20+ and install project dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Configure environment variables:
   Copy \`.env.example\` to \`.env\` and add your keys:
   \`\`\`bash
   cp .env.example .env
   \`\`\`
   - \`GEMINI_API_KEY\` — Required for AI notes, lecture speech-to-text, flashcards, Q&A, and spoken readout.
   - \`RAZORPAY_KEY_ID\` (optional override) and \`RAZORPAY_KEY_SECRET\` (optional for server-signed Orders API).

3. Run in development mode (Express + Vite on http://localhost:3000):
   \`\`\`bash
   npm run dev
   \`\`\`

4. Build and run in production:
   \`\`\`bash
   npm run build
   NODE_ENV=production npm start
   \`\`\`

## Included Stack
- Frontend: React 19 + TypeScript + Tailwind CSS v4 + Motion
- Backend: Express + Multer + @google/genai + Razorpay Checkout API
- Database & Auth: Firebase Firestore & Google Sign-In (\`firebase-applet-config.json\` & \`firestore.rules\`)
`;

function collectProjectFiles(
  rootDir: string
): { relPath: string; data: Buffer; mtime: Date }[] {
  const collected: { relPath: string; data: Buffer; mtime: Date }[] = [];

  for (const fileName of ROOT_FILES) {
    const fullPath = path.join(rootDir, fileName);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const stat = fs.statSync(fullPath);
      collected.push({
        relPath: fileName,
        data: fs.readFileSync(fullPath),
        mtime: stat.mtime,
      });
    }
  }

  for (const dirName of SOURCE_DIRS) {
    collectDirFiles(rootDir, dirName, collected);
  }

  collected.push({
    relPath: 'README.md',
    data: Buffer.from(SETUP_README, 'utf8'),
    mtime: new Date(),
  });

  return collected;
}

export function buildWebsiteArchive(rootDir: string): Buffer {
  const files = collectProjectFiles(rootDir);
  const entries: ZipEntryInput[] = files.map((file) => ({
    name: `notevox/${file.relPath}`,
    data: file.data,
    mtime: file.mtime,
  }));

  return buildZipBuffer(entries);
}

/**
 * Compresses the entire Notevox full-stack codebase (frontend, Express backend,
 * configs, Firebase rules, and active studio assets) into ONE self-extracting
 * ES module JavaScript file (`notevox-onefile.mjs`).
 *
 * Usage:
 *   node notevox-onefile.mjs            # extracts full codebase into ./notevox
 *   node notevox-onefile.mjs my-dir     # extracts into ./my-dir
 *   node notevox-onefile.mjs --list     # lists all compressed files & sizes
 */
export function buildOneFileCodeScript(rootDir: string): Buffer {
  const files = collectProjectFiles(rootDir);
  const payload = {
    app: 'Notevox',
    tagline: 'Your Knowledge. Your Way.',
    generatedAt: new Date().toISOString(),
    files: files.map((file) => {
      const text = isTextFile(file.relPath);
      return {
        path: file.relPath,
        encoding: text ? ('utf8' as const) : ('base64' as const),
        data: file.data.toString(text ? 'utf8' : 'base64'),
      };
    }),
  };

  const jsonBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const gzipBuffer = zlib.gzipSync(jsonBuffer, { level: 9 });
  const base64 = gzipBuffer.toString('base64');

  // Wrap base64 cleanly at 120 characters per line for editor friendliness
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += 120) {
    chunks.push(base64.slice(i, i + 120));
  }

  const totalRawBytes = files.reduce((sum, f) => sum + f.data.length, 0);

  const script = `#!/usr/bin/env node
/**
 * ============================================================================
 * NOTEVOX — COMPLETE CODEBASE COMPRESSED INTO ONE FILE
 * "Your Knowledge. Your Way."
 *
 * Files bundled: ${files.length}
 * Uncompressed size: ${(totalRawBytes / 1024).toFixed(1)} KB
 * Compressed size: ${(gzipBuffer.length / 1024).toFixed(1)} KB (gzip level 9)
 *
 * Commands:
 *   node notevox-onefile.mjs            Extract full project into ./notevox
 *   node notevox-onefile.mjs <dir>      Extract full project into <dir>
 *   node notevox-onefile.mjs --list     Inspect all bundled files
 *
 * After extracting:
 *   cd notevox && npm install && cp .env.example .env && npm run dev
 * ============================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PAYLOAD_B64 = [
${chunks.map((line) => `  "${line}"`).join(',\n')}
].join('');

function decodeBundle() {
  const compressed = Buffer.from(PAYLOAD_B64, 'base64');
  const json = zlib.gunzipSync(compressed).toString('utf8');
  return JSON.parse(json);
}

const args = process.argv.slice(2);
const listOnly = args.includes('--list') || args.includes('-l');
const targetArg = args.find((a) => !a.startsWith('-')) || 'notevox';
const bundle = decodeBundle();

if (listOnly) {
  console.log(\`\${bundle.app} — \${bundle.files.length} files compressed (generated \${bundle.generatedAt})\`);
  for (const file of bundle.files) {
    const byteLen = Buffer.byteLength(file.data, file.encoding === 'base64' ? 'base64' : 'utf8');
    console.log(\`  \${file.path} (\${(byteLen / 1024).toFixed(1)} KB)\`);
  }
  process.exit(0);
}

const targetRoot = path.resolve(process.cwd(), targetArg);
fs.mkdirSync(targetRoot, { recursive: true });

for (const file of bundle.files) {
  const outPath = path.resolve(targetRoot, file.path);
  if (outPath !== targetRoot && !outPath.startsWith(targetRoot + path.sep)) {
    throw new Error(\`Refusing unsafe path outside target directory: \${file.path}\`);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const content = Buffer.from(file.data, file.encoding === 'base64' ? 'base64' : 'utf8');
  fs.writeFileSync(outPath, content);
}

console.log(\`Extracted \${bundle.files.length} Notevox files into \${targetRoot}\`);
console.log(\`Next steps:\`);
console.log(\`  cd \${path.relative(process.cwd(), targetRoot) || '.'}\`);
console.log(\`  npm install\`);
console.log(\`  cp .env.example .env   # add GEMINI_API_KEY\`);
console.log(\`  npm run dev\`);
`;

  return Buffer.from(script, 'utf8');
}

function escapeInlineScriptClosingTags(jsCode: string): string {
  // Neutralize literal </script sequences inside inline <script> blocks without breaking JS regexes/strings
  return jsCode.replace(/(<\/)(script)/gi, (_match, _slash, tag) => `<\\/${tag}`);
}

function inlineAssetImagesIntoJs(jsCode: string, rootDir: string): string {
  let out = jsCode;
  for (const fileName of ACTIVE_IMAGE_ASSETS) {
    const assetPath = path.join(rootDir, 'src', 'assets', 'images', fileName);
    if (!fs.existsSync(assetPath)) continue;
    const dataUri = `data:image/jpeg;base64,${fs.readFileSync(assetPath).toString('base64')}`;
    out = out.split(`/src/assets/images/${fileName}`).join(dataUri);
  }
  return out;
}

/**
 * Packages the compiled Notevox frontend (HTML + CSS + JS module + base64 studio
 * images) into a single standalone `.html` file (`notevox-single.html`).
 */
export function buildSingleHtmlBundle(rootDir: string): Buffer {
  const distDir = path.join(rootDir, 'dist');
  const distHtmlPath = path.join(distDir, 'index.html');

  if (!fs.existsSync(distHtmlPath)) {
    const viteBin = path.join(rootDir, 'node_modules', '.bin', 'vite');
    if (fs.existsSync(viteBin)) {
      execFileSync(viteBin, ['build'], { cwd: rootDir, stdio: 'pipe' });
    } else {
      execFileSync('npx', ['vite', 'build'], { cwd: rootDir, stdio: 'pipe' });
    }
  }

  let html = fs.readFileSync(distHtmlPath, 'utf8');

  // Inline built stylesheets
  html = html.replace(
    /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (fullMatch, href: string) => {
      const cleanRel = href.replace(/^\/+/, '');
      const cssPath = path.resolve(distDir, cleanRel);
      if (!cssPath.startsWith(distDir + path.sep) || !fs.existsSync(cssPath)) {
        return fullMatch;
      }
      const css = fs.readFileSync(cssPath, 'utf8');
      return `<style>\n${css}\n</style>`;
    }
  );

  // Inline built module scripts with embedded base64 images
  html = html.replace(
    /<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
    (fullMatch, src: string) => {
      const cleanRel = src.replace(/^\/+/, '');
      const jsPath = path.resolve(distDir, cleanRel);
      if (!jsPath.startsWith(distDir + path.sep) || !fs.existsSync(jsPath)) {
        return fullMatch;
      }
      const rawJs = fs.readFileSync(jsPath, 'utf8');
      const withImages = inlineAssetImagesIntoJs(rawJs, rootDir);
      const safeJs = escapeInlineScriptClosingTags(withImages);
      return `<script type="module">\n${safeJs}\n</script>`;
    }
  );

  return Buffer.from(html, 'utf8');
}

