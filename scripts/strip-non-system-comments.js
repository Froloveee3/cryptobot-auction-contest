const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
]);

const TARGET_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.d.ts']);

function isIdentChar(ch) {
  return !!ch && /[A-Za-z0-9_$]/.test(ch);
}

function normalizeCommentBody(commentText) {
  const t = String(commentText || '');
  if (t.startsWith('///')) return '///';
  if (t.startsWith('//')) return t.slice(2).trim();
  if (t.startsWith('/*')) return t.slice(2, t.endsWith('*/') ? -2 : t.length).trim();
  return t.trim();
}

function isPreservedComment(commentText) {
  const raw = String(commentText || '');
  if (raw.startsWith('///')) return true;

  const body = normalizeCommentBody(raw);

  if (!body) return false;

  if (/^eslint\b/i.test(body)) return true;
  if (/\beslint-(disable|enable|disable-next-line|disable-line)\b/i.test(body)) return true;
  if (/\beslint-env\b/i.test(body)) return true;

  if (/@ts-(ignore|expect-error|nocheck)\b/.test(body)) return true;
  if (/^tslint:(disable|enable)\b/i.test(body)) return true;
  if (/\bprettier-ignore\b/i.test(body)) return true;
  if (/\b(jest|vitest)-environment\b/i.test(body)) return true;
  if (/\b(istanbul|c8)\s+ignore\b/i.test(body)) return true;

  if (/\b(sourceMappingURL=|sourceURL=)\b/i.test(body)) return true;

  if (/\b(@__PURE__|#__PURE__)\b/.test(body)) return true;

  if (/^(global|globals|exported)\b/i.test(body)) return true;

  return false;
}

function isUrlDoubleSlashFalsePositive(sourceText, start) {
  if (!sourceText || start < 0) return false;
  if (sourceText[start] !== '/' || sourceText[start + 1] !== '/') return false;

  const before5 = sourceText.slice(Math.max(0, start - 5), start);
  const before6 = sourceText.slice(Math.max(0, start - 6), start);
  const before4 = sourceText.slice(Math.max(0, start - 4), start);
  const before3 = sourceText.slice(Math.max(0, start - 3), start);

  if (before5 === 'http:' || before6 === 'https:' || before3 === 'ws:' || before4 === 'wss:') return true;
  return false;
}

function scriptKindForExt(ext) {
  switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function stripFileComments(filePath) {
  const ext = path.extname(filePath);
  const original = fs.readFileSync(filePath, 'utf8');
  if (!original) return false;

  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, original);
  scanner.setScriptKind(scriptKindForExt(ext));
  scanner.setText(original);

  const ranges = [];
  while (true) {
    const kind = scanner.scan();
    if (kind === ts.SyntaxKind.EndOfFileToken) break;
    if (kind !== ts.SyntaxKind.SingleLineCommentTrivia && kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;

    const start = scanner.getTokenPos();
    const end = scanner.getTextPos();
    if (start >= end) continue;

    if (kind === ts.SyntaxKind.SingleLineCommentTrivia && isUrlDoubleSlashFalsePositive(original, start)) continue;

    const text = original.slice(start, end);
    if (isPreservedComment(text)) continue;

    ranges.push({ start, end, kind });
  }

  if (ranges.length === 0) return false;

  ranges.sort((a, b) => a.start - b.start);

  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      last.kind = last.kind === ts.SyntaxKind.MultiLineCommentTrivia ? last.kind : r.kind;
    } else {
      merged.push({ ...r });
    }
  }

  let out = '';
  let lastIndex = 0;
  for (const r of merged) {
    out += original.slice(lastIndex, r.start);

    if (r.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      const before = original[r.start - 1];
      const after = original[r.end];
      if (isIdentChar(before) && isIdentChar(after)) out += ' ';
    }

    lastIndex = r.end;
  }
  out += original.slice(lastIndex);

  if (out !== original) {
    fs.writeFileSync(filePath, out, 'utf8');
    return true;
  }
  return false;
}

function walk(dir, onFile) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) {
      if (e.name === '.env' || e.name === '.env.example') continue;
      if (e.name === '.eslintrc.js') continue;
      if (e.name === '.prettierrc' || e.name === '.prettierignore') continue;
      if (e.name === '.gitignore') continue;
      continue;
    }

    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, onFile);
      continue;
    }

    const ext = path.extname(e.name);
    if (!TARGET_EXTS.has(ext)) continue;
    onFile(full);
  }
}

function main() {
  let changed = 0;
  let scanned = 0;
  walk(ROOT, (filePath) => {
    scanned += 1;
    if (stripFileComments(filePath)) changed += 1;
  });

  // eslint-disable-next-line no-console
  console.log(`strip-non-system-comments: scanned=${scanned} changed=${changed}`);
}

main();

