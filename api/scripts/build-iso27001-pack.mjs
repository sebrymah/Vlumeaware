#!/usr/bin/env node
/**
 * Generates the loadable ISO/IEC 27001:2022 awareness content pack from the
 * approved programme document.
 *
 *   node api/scripts/build-iso27001-pack.mjs
 *
 * Input   docs/Vlumeaware-ISO27001-Phishing-Awareness-Pack.md   (approved content)
 *         api/prisma/content/iso27001-2022.ts                   (topic metadata)
 * Output  api/prisma/content/iso27001-awareness-pack.ts
 *
 * The document is the approved artefact, so it is the source of truth for every
 * question and every lure. Topic metadata — title, Annex A references and the
 * training video outline — is carried over from the original pack file so the
 * two files cannot drift.
 *
 * Only the 24 email-runnable lures are emitted. The six non-email scenarios
 * (SMS, voice, QR, chat-app, removable media) are deliberately excluded: the
 * platform sends email only, and a lure a client cannot send must not appear in
 * the cloneable catalogue.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const DOC = resolve(root, 'docs/Vlumeaware-ISO27001-Phishing-Awareness-Pack.md');
const SRC = resolve(root, 'api/prisma/content/iso27001-2022.ts');
const OUT = resolve(root, 'api/prisma/content/iso27001-awareness-pack.ts');

const doc = readFileSync(DOC, 'utf8');
const src = readFileSync(SRC, 'utf8');

/* ------------------------------------------------------------------ helpers */

/** Unescape a single-quoted TS string body. */
const unq = (s) => s.replace(/\\(['\\])/g, '$1');

/** Markdown inline -> a safe subset of HTML. */
const inline = (s) =>
  s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/**
 * Markdown -> plain text. Red flags, titles and subjects are rendered as plain
 * text by the console, so emphasis markers must not survive into the data.
 */
const plain = (s) =>
  s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .trim();

/** Blockquoted markdown lines -> bodyHtml paragraphs. */
function blockquoteToHtml(lines) {
  const paras = [];
  let cur = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      if (cur.length) paras.push(cur);
      cur = [];
    } else {
      cur.push(line);
    }
  }
  if (cur.length) paras.push(cur);
  return paras.map((p) => `<p>${p.map(inline).join('<br/>')}</p>`).join('');
}

const field = (block, name) => {
  const m = block.match(new RegExp(`\\*\\*${name}\\*\\*\\s*([^\\n]*)`));
  return m ? m[1].trim() : '';
};

/* ------------------------------------------------- topic metadata from source */

const topics = [];
{
  const body = src.split('export const ISO_27001_2022_PACK: ContentPackage[] = [')[1];
  const blocks = body.split("\n  {\n    key: '").slice(1);
  for (const b of blocks) {
    const key = b.slice(0, b.indexOf("'"));
    const topic = b.match(/topic: '([^']*)'/)[1];
    const isoRefs = b
      .match(/isoRefs: \[([^\]]*)\]/)[1]
      .split(',')
      .map((x) => x.trim().replace(/^'|'$/g, ''));
    const v = b.split('video: {')[1].split('quiz: {')[0];
    const grab = (n) => {
      const m = v.match(new RegExp(`${n}:\\s*\\n?\\s*'((?:[^'\\\\]|\\\\.)*)'`));
      return m ? unq(m[1]) : '';
    };
    const scriptBlock = v.split('script: [')[1].split(']')[0];
    const script = [...scriptBlock.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => unq(m[1]));
    topics.push({
      key,
      topic,
      isoRefs,
      video: {
        title: grab('title'),
        category: grab('category'),
        durationSeconds: Number(v.match(/durationSeconds: (\d+)/)[1]),
        description: grab('description'),
        script,
      },
    });
  }
}
if (topics.length !== 10) throw new Error(`expected 10 topics, parsed ${topics.length}`);

/* --------------------------------------------------------------- parse Part C */

const partC = doc.split('# Part C — Quiz bank')[1].split('# Part D — Simulation scenarios')[0];
const quizzesByTopicTier = new Map();
{
  let key = null;
  for (const line of partC.split('\n')) {
    const h = line.match(/^### Topic (\d+) — (.+?): Tier ([123]) — (.+)$/);
    if (h) {
      key = `${h[1]}|${h[3]}`;
      quizzesByTopicTier.set(key, { tier: Number(h[3]), name: h[4].trim(), questions: [] });
      continue;
    }
    const bucket = key && quizzesByTopicTier.get(key);
    if (!bucket) continue;
    const q = line.match(/^\*\*Q(\d+)\.(\d)\.(\d)\*\* (.+)$/);
    if (q) {
      bucket.questions.push({ prompt: q[4].trim(), options: [], correctIndex: -1, explanation: '', isoRef: '' });
      continue;
    }
    const o = line.match(/^- ([A-D])\. (.+)$/);
    if (o && bucket.questions.length) {
      bucket.questions.at(-1).options.push(o[2].trim());
      continue;
    }
    const a = line.match(/^\*\*Answer: ([A-D])\*\* — (.+)$/);
    if (a && bucket.questions.length) {
      bucket.questions.at(-1).correctIndex = 'ABCD'.indexOf(a[1]);
      bucket.questions.at(-1).explanation = a[2].trim();
      continue;
    }
    const r = line.match(/^`ISO: (A\.[\d.]+) ·/);
    if (r && bucket.questions.length) bucket.questions.at(-1).isoRef = r[1];
  }
}

/* --------------------------------------------------------------- parse Part D */

const partD = doc.split('# Part D — Simulation scenarios')[1].split('# Part E —')[0];
const luresByTopic = new Map();
{
  let cur = null;
  let body = [];
  const flush = () => {
    if (!cur) return;
    if (cur.runnable) {
      const list = luresByTopic.get(cur.topicNo) ?? [];
      list.push({
        title: plain(cur.title),
        category: plain(cur.category) || 'Phishing',
        difficultyTier: cur.difficulty,
        industryTag: plain(cur.roles) || undefined,
        subjectLine: plain(cur.subject),
        bodyHtml: blockquoteToHtml(body),
        senderSpoofName: plain(cur.sender),
        redFlags: cur.redFlags.map(plain),
      });
      luresByTopic.set(cur.topicNo, list);
    }
    cur = null;
    body = [];
  };
  for (const line of partD.split('\n')) {
    const h = line.match(/^## (D-\d\d|T-\d\d) · (.+)$/);
    if (h) {
      flush();
      const meta = partD.split(line)[1].split('\n').find((l) => l.startsWith('**Channel**')) ?? '';
      const t = meta.match(/\*\*Topic\*\*\s*(\d+)/);
      const d = meta.match(/\*\*Difficulty\*\*\s*([A-Za-z]+)/);
      const r = meta.match(/\*\*Roles\*\*\s*([^—]+)/);
      cur = {
        id: h[1],
        title: h[2].trim(),
        runnable: /Email · runnable/.test(meta),
        topicNo: t ? Number(t[1]) : 0,
        difficulty: (d ? d[1] : 'medium').toLowerCase(),
        roles: r ? r[1].trim() : '',
        category: '',
        subject: '',
        sender: '',
        redFlags: [],
      };
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('**Lure category**')) cur.category = line.replace('**Lure category**', '').trim();
    else if (line.startsWith('**Subject:**')) cur.subject = line.replace('**Subject:**', '').trim();
    else if (line.startsWith('**From:**')) {
      const m = line.match(/`([^`]+)`/);
      cur.sender = m ? m[1].split('<')[0].trim() : '';
    } else if (line.startsWith('**Red flags**')) {
      cur.redFlags = line
        .replace('**Red flags**', '')
        .split('·')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (line.startsWith('>')) {
      body.push(line.replace(/^>\s?/, ''));
    }
  }
  flush();
}

/* ------------------------------------------------------------------- assemble */

const pack = topics.map((t, i) => {
  const topicNo = i + 1;
  const quizzes = [1, 2, 3].map((tier) => {
    const found = quizzesByTopicTier.get(`${topicNo}|${tier}`);
    if (!found) throw new Error(`missing quiz for topic ${topicNo} tier ${tier}`);
    return {
      tier,
      title: `${t.topic} — Tier ${tier}`,
      category: t.topic,
      passingScorePct: 80,
      questions: found.questions.map((q) => ({ ...q, tier })),
    };
  });
  return {
    key: t.key,
    topic: t.topic,
    isoRefs: t.isoRefs,
    module: {
      title: t.video.title,
      description: t.video.description,
      category: t.video.category,
      videoUrl: `https://videos.vlumetech.example/library/iso27001-${t.key}.mp4`,
      durationSeconds: t.video.durationSeconds,
      script: t.video.script,
    },
    quizzes,
    lures: luresByTopic.get(topicNo) ?? [],
  };
});

/* ------------------------------------------------------------------- validate */

let qCount = 0;
let lCount = 0;
for (const t of pack) {
  for (const q of t.quizzes) {
    if (q.questions.length !== 5) throw new Error(`${q.title}: ${q.questions.length} questions`);
    for (const qq of q.questions) {
      if (qq.options.length !== 4) throw new Error(`${q.title}: option count ${qq.options.length}`);
      if (qq.correctIndex < 0 || qq.correctIndex > 3) throw new Error(`${q.title}: bad correctIndex`);
      if (!qq.prompt || !qq.explanation) throw new Error(`${q.title}: missing prompt/explanation`);
      qCount++;
    }
  }
  for (const l of t.lures) {
    if (!l.subjectLine || !l.bodyHtml || !l.senderSpoofName || !l.redFlags.length) {
      throw new Error(`lure incomplete: ${l.title}`);
    }
    // The client scenario composer refuses to save a body without the tracking
    // placeholder, and a lure that cannot be saved cannot be measured.
    if (!l.bodyHtml.includes('{{TRACKING_URL}}')) {
      throw new Error(`lure has no {{TRACKING_URL}} link, so the composer will reject it: ${l.title}`);
    }
    lCount++;
  }
}
if (qCount !== 150) throw new Error(`expected 150 questions, got ${qCount}`);
if (lCount !== 24) throw new Error(`expected 24 runnable lures, got ${lCount}`);

const keyBalance = { A: 0, B: 0, C: 0, D: 0 };
for (const t of pack) for (const q of t.quizzes) for (const qq of q.questions) keyBalance['ABCD'[qq.correctIndex]]++;
for (const [k, v] of Object.entries(keyBalance)) {
  if (v < 20 || v > 60) throw new Error(`answer key unbalanced: ${k}=${v}`);
}

/* ---------------------------------------------------------------------- write */

const j = (s) => JSON.stringify(s);
const out = [];
out.push(`/**
 * ISO/IEC 27001:2022 awareness content pack — the full quiz and lure bank.
 *
 * GENERATED FILE — do not edit by hand.
 *   Source:     docs/Vlumeaware-ISO27001-Phishing-Awareness-Pack.md
 *   Regenerate: node api/scripts/build-iso27001-pack.mjs
 *
 * Ten topics, each with three five-question quizzes (Tier 1 Foundation,
 * Tier 2 Practitioner, Tier 3 Advanced) and its email-runnable lures. Topic
 * metadata — title, Annex A references and the training-video outline — is
 * carried here so this file is the single authoritative pack for the loader.
 *
 * The six non-email scenarios (SMS, voice, QR, chat-app, removable media) are
 * deliberately absent: the platform sends email only, and a lure a client
 * cannot send must not appear in the cloneable catalogue.
 *
 * Generated ${new Date().toISOString().slice(0, 10)} · ${qCount} questions · ${lCount} lures.
 */

import type { QuizQuestion, Tier } from './iso27001-2022';

/** A quiz question plus the context the content bank carries for traceability. */
export interface PackQuestion extends QuizQuestion {
  /** The Annex A (2022) control this item assesses. */
  isoRef: string;
  tier: 1 | 2 | 3;
}

export interface PackQuiz {
  tier: 1 | 2 | 3;
  /** Library title — unique, and the loader's idempotency key. */
  title: string;
  category: string;
  passingScorePct: number;
  questions: PackQuestion[];
}

export interface PackLure {
  title: string;
  category: string;
  difficultyTier: Tier;
  industryTag?: string;
  subjectLine: string;
  bodyHtml: string;
  senderSpoofName: string;
  redFlags: string[];
}

export interface PackModule {
  title: string;
  description: string;
  category: string;
  /** Placeholder until the produced video files exist. */
  videoUrl: string;
  durationSeconds: number;
  /** Narrated outline for the produced video. Not persisted by the platform. */
  script: string[];
}

export interface TopicPack {
  key: string;
  topic: string;
  isoRefs: string[];
  module: PackModule;
  quizzes: PackQuiz[];
  lures: PackLure[];
}

export const ISO_27001_AWARENESS_PACK: TopicPack[] = [`);

for (const t of pack) {
  out.push('  {');
  out.push(`    key: ${j(t.key)},`);
  out.push(`    topic: ${j(t.topic)},`);
  out.push(`    isoRefs: [${t.isoRefs.map(j).join(', ')}],`);
  out.push('    module: {');
  out.push(`      title: ${j(t.module.title)},`);
  out.push(`      description: ${j(t.module.description)},`);
  out.push(`      category: ${j(t.module.category)},`);
  out.push(`      videoUrl: ${j(t.module.videoUrl)},`);
  out.push(`      durationSeconds: ${t.module.durationSeconds},`);
  out.push('      script: [');
  for (const s of t.module.script) out.push(`        ${j(s)},`);
  out.push('      ],');
  out.push('    },');
  out.push('    quizzes: [');
  for (const q of t.quizzes) {
    out.push('      {');
    out.push(`        tier: ${q.tier},`);
    out.push(`        title: ${j(q.title)},`);
    out.push(`        category: ${j(q.category)},`);
    out.push(`        passingScorePct: ${q.passingScorePct},`);
    out.push('        questions: [');
    for (const qq of q.questions) {
      out.push('          {');
      out.push(`            prompt: ${j(qq.prompt)},`);
      out.push(`            options: [${qq.options.map(j).join(', ')}],`);
      out.push(`            correctIndex: ${qq.correctIndex},`);
      out.push(`            explanation: ${j(qq.explanation)},`);
      out.push(`            isoRef: ${j(qq.isoRef)},`);
      out.push(`            tier: ${qq.tier},`);
      out.push('          },');
    }
    out.push('        ],');
    out.push('      },');
  }
  out.push('    ],');
  out.push('    lures: [');
  for (const l of t.lures) {
    out.push('      {');
    out.push(`        title: ${j(l.title)},`);
    out.push(`        category: ${j(l.category)},`);
    out.push(`        difficultyTier: ${j(l.difficultyTier)},`);
    if (l.industryTag) out.push(`        industryTag: ${j(l.industryTag)},`);
    out.push(`        subjectLine: ${j(l.subjectLine)},`);
    out.push(`        bodyHtml: ${j(l.bodyHtml)},`);
    out.push(`        senderSpoofName: ${j(l.senderSpoofName)},`);
    out.push(`        redFlags: [${l.redFlags.map(j).join(', ')}],`);
    out.push('      },');
  }
  out.push('    ],');
  out.push('  },');
}
out.push('];');
out.push('');

writeFileSync(OUT, out.join('\n'), 'utf8');

console.log(`wrote ${OUT}`);
console.log(`  topics   ${pack.length}`);
console.log(`  quizzes  ${pack.reduce((n, t) => n + t.quizzes.length, 0)}`);
console.log(`  questions ${qCount}  (answer key ${JSON.stringify(keyBalance)})`);
console.log(`  lures    ${lCount}`);
console.log(`  modules  ${pack.length}`);
