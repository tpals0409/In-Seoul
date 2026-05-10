#!/usr/bin/env node
// Collate Sprint 6 실기기 UAT results into a single Markdown table.
// Usage:
//   npm run uat:collate < .planning/sprint/6/uat-results.md
//   node scripts/collate-uat.mjs .planning/sprint/6/uat-results.md
//
// Input: a Markdown file containing one or more `## iOS` / `## Android`
// sections with `key: value` lines (matching uat-results-template.md).
// Output: stdout — Markdown table with columns
//   host | platform | model_download | peak_rss_mb | peak_pss_mb | peak_dirty_mb
//        | native_heap_mb | egl_mtrack_mb | rag_quality | issues
// Missing fields render as `—`.

import { readFileSync } from 'node:fs';

const COLUMNS = [
  ['host', 'host'],
  ['platform', 'platform'],
  ['model_download', 'model_download'],
  ['peak_rss_mb', 'peak_rss_mb'],
  ['peak_pss_mb', 'peak_pss_mb'],
  ['peak_dirty_mb', 'peak_dirty_mb'],
  ['native_heap_mb', 'native_heap_mb'],
  ['egl_mtrack_mb', 'egl_mtrack_mb'],
  ['rag_quality', 'rag_response_quality'],
  ['issues', 'issues'],
];

const MISSING = '—';
const PLACEHOLDER_RE = /^<.*>$/;

function readSource() {
  const arg = process.argv[2];
  if (arg) return readFileSync(arg, 'utf8');
  if (process.stdin.isTTY) {
    process.stderr.write(
      'usage: node scripts/collate-uat.mjs <path>\n' +
      '   or: npm run uat:collate < .planning/sprint/6/uat-results.md\n',
    );
    process.exit(0);
  }
  try {
    return readFileSync(0, 'utf8');
  } catch (err) {
    if (err && err.code === 'EAGAIN') return '';
    throw err;
  }
}

function splitSections(src) {
  // Split on top-level `## <Heading>` lines. Keep heading with the body so we
  // can label each section's platform.
  const out = [];
  const lines = src.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) out.push(current);
      current = { heading: m[1].trim(), body: '' };
      continue;
    }
    if (current) current.body += line + '\n';
  }
  if (current) out.push(current);
  return out;
}

function detectPlatform(heading) {
  const h = heading.toLowerCase();
  if (h.includes('ios') || h.includes('iphone')) return 'iOS';
  if (h.includes('android')) return 'Android';
  return null;
}

function parseFields(body) {
  const fields = {};
  const re = /^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(re);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (!value || PLACEHOLDER_RE.test(value)) continue;
    fields[key] = value;
  }
  return fields;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function renderTable(rows) {
  const header = COLUMNS.map(([label]) => label);
  const separator = COLUMNS.map(() => '---');
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
  ];
  for (const row of rows) {
    const cells = COLUMNS.map(([label, key]) => {
      if (label === 'platform') return row.platform;
      const v = row.fields[key];
      return v ? escapeCell(v) : MISSING;
    });
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function main() {
  const src = readSource();
  if (!src.trim()) {
    process.stderr.write('collate-uat: empty input — nothing to do.\n');
    return;
  }
  const sections = splitSections(src)
    .map((s) => ({ ...s, platform: detectPlatform(s.heading) }))
    .filter((s) => s.platform !== null);

  if (sections.length === 0) {
    process.stderr.write(
      'collate-uat: no `## iOS` / `## Android` sections found.\n',
    );
    return;
  }

  const rows = sections.map((s) => ({
    platform: s.platform,
    fields: parseFields(s.body),
  }));

  process.stdout.write(renderTable(rows) + '\n');
}

main();
