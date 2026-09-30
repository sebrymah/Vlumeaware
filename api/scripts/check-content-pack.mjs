#!/usr/bin/env node
/**
 * Read-only health check for the shared content library.
 *
 * Safe to point at production: this script issues SELECT statements only and
 * never writes. Run it BEFORE a content load to confirm you are pointed at the
 * right database, and AFTER to confirm the ISO/IEC 27001:2022 pack landed
 * intact.
 *
 *   node scripts/check-content-pack.mjs            # report only
 *   node scripts/check-content-pack.mjs --strict   # exit 1 unless the pack is complete
 *
 * DATABASE_URL must be set (via --env-file, or the environment).
 */
import { PrismaClient } from '@prisma/client';

const ISO_SOURCE = 'ISO/IEC 27001:2022 awareness pack';
const EXPECT_QUIZZES = 30;
const EXPECT_TEMPLATES = 24;
const EXPECT_QUESTIONS = 150;
const strict = process.argv.includes('--strict');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Pass it with --env-file=... or export it first.');
  process.exit(2);
}

let target = '(unparseable DATABASE_URL)';
try {
  const u = new URL(url);
  target = `${u.host}${u.pathname}`;
} catch {
  /* keep the placeholder */
}

const prisma = new PrismaClient();
const problems = [];

try {
  const [{ db }] = await prisma.$queryRawUnsafe('select current_database() as db');
  console.log('target database   ', target, ` (current_database: ${db})`);
  console.log('');

  const totalQuizzes = await prisma.sharedQuiz.count();
  const isoQuizzes = await prisma.sharedQuiz.count({ where: { source: ISO_SOURCE } });
  const totalTemplates = await prisma.phishingTemplate.count();
  const isoTemplates = await prisma.phishingTemplate.count({ where: { source: ISO_SOURCE } });
  const totalModules = await prisma.sharedTrainingModule.count();

  console.log('LIBRARY TOTALS');
  console.log(`  shared quizzes            ${String(totalQuizzes).padStart(4)}   (ISO pack ${isoQuizzes}/${EXPECT_QUIZZES})`);
  console.log(`  phishing templates        ${String(totalTemplates).padStart(4)}   (ISO pack ${isoTemplates}/${EXPECT_TEMPLATES})`);
  console.log(`  shared training modules   ${String(totalModules).padStart(4)}   (ISO pack contributes 10)`);
  console.log('');

  const [{ questions }] = await prisma.$queryRawUnsafe(
    `select coalesce(sum(jsonb_array_length(questions)), 0)::int as questions
       from shared_quizzes where source = $1`,
    ISO_SOURCE,
  );
  const [{ wrongsize }] = await prisma.$queryRawUnsafe(
    `select count(*)::int as wrongsize from shared_quizzes
      where source = $1 and jsonb_array_length(questions) <> 5`,
    ISO_SOURCE,
  );
  const [{ badoptions }] = await prisma.$queryRawUnsafe(
    `select count(*)::int as badoptions
       from shared_quizzes, jsonb_array_elements(questions) q
      where source = $1 and jsonb_array_length(q->'options') <> 4`,
    ISO_SOURCE,
  );
  const [{ gameable }] = await prisma.$queryRawUnsafe(
    `select count(*)::int as gameable from (
       select id from shared_quizzes, jsonb_array_elements(questions) q
        where source = $1 group by id
       having sum(case when (q->>'correctIndex')::int = 1 then 1 else 0 end) * 20 >= 80
     ) t`,
    ISO_SOURCE,
  );
  const keyRows = await prisma.$queryRawUnsafe(
    `select chr(65 + (q->>'correctIndex')::int) as answer, count(*)::int as n
       from shared_quizzes, jsonb_array_elements(questions) q
      where source = $1 group by 1 order by 1`,
    ISO_SOURCE,
  );
  const [{ notracked }] = await prisma.$queryRawUnsafe(
    `select count(*)::int as notracked from phishing_templates
      where source = $1 and body_html not like '%{{TRACKING_URL}}%'`,
    ISO_SOURCE,
  );

  console.log('ISO PACK INTEGRITY');
  console.log(`  questions in pack         ${questions} (expect ${EXPECT_QUESTIONS})`);
  console.log(`  answer key                ${keyRows.map((r) => `${r.answer}=${r.n}`).join('  ')}`);
  console.log(`  quizzes not 5 questions   ${wrongsize}`);
  console.log(`  questions not 4 options   ${badoptions}`);
  console.log(`  quizzes guessable by "B"  ${gameable}`);
  console.log(`  lures with no tracking link ${notracked}`);
  console.log('');

  if (isoQuizzes !== EXPECT_QUIZZES) problems.push(`expected ${EXPECT_QUIZZES} ISO quizzes, found ${isoQuizzes}`);
  if (isoTemplates !== EXPECT_TEMPLATES) problems.push(`expected ${EXPECT_TEMPLATES} ISO lures, found ${isoTemplates}`);
  if (questions !== EXPECT_QUESTIONS) problems.push(`expected ${EXPECT_QUESTIONS} questions, found ${questions}`);
  if (wrongsize !== 0) problems.push(`${wrongsize} quizzes do not have exactly 5 questions`);
  if (badoptions !== 0) problems.push(`${badoptions} questions do not have exactly 4 options`);
  if (gameable !== 0) problems.push(`${gameable} quizzes are passable by always answering "B"`);
  if (notracked !== 0) problems.push(`${notracked} lures have no {{TRACKING_URL}} and cannot be saved or measured`);

  if (problems.length === 0) {
    console.log('RESULT: ISO 27001:2022 content pack is COMPLETE and sound.');
  } else {
    console.log('RESULT: INCOMPLETE —');
    for (const p of problems) console.log(`  - ${p}`);
  }

  if (strict && problems.length) process.exitCode = 1;
} catch (err) {
  console.error('CHECK FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 3;
} finally {
  await prisma.$disconnect();
}
