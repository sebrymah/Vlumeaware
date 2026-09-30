/**
 * Emits idempotent SQL for the ISO 27001 awareness pack — the same rows
 * seedIsoPack() would create, keyed by title with INSERT ... WHERE NOT EXISTS,
 * so it can be applied through the Supabase SQL tool without the DB password.
 * No database access: it only reads the generated pack and writes .sql files.
 */
import { writeFileSync } from 'node:fs';
import { ISO_27001_AWARENESS_PACK } from '../prisma/content/iso27001-awareness-pack';

const SOURCE = 'ISO/IEC 27001:2022 awareness pack';
const q = (s: unknown) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (a: string[]) => (a.length ? `ARRAY[${a.map(q).join(',')}]::text[]` : `ARRAY[]::text[]`);
const jsonb = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

const modules: string[] = [];
const quizzes: string[] = [];
const lures: string[] = [];

for (const topic of ISO_27001_AWARENESS_PACK) {
  const m = topic.module;
  modules.push(
    `INSERT INTO shared_training_modules (id,title,description,category,video_url,video_source,duration_seconds,created_at) ` +
      `SELECT gen_random_uuid(),${q(m.title)},${q(m.description)},${q(m.category)},${q(m.videoUrl)},'link',${m.durationSeconds},now() ` +
      `WHERE NOT EXISTS (SELECT 1 FROM shared_training_modules WHERE title=${q(m.title)});`,
  );

  for (const quiz of topic.quizzes) {
    quizzes.push(
      `INSERT INTO shared_quizzes (id,title,category,passing_score_pct,source,questions,created_at) ` +
        `SELECT gen_random_uuid(),${q(quiz.title)},${q(quiz.category)},${quiz.passingScorePct},${q(SOURCE)},${jsonb(quiz.questions)},now() ` +
        `WHERE NOT EXISTS (SELECT 1 FROM shared_quizzes WHERE title=${q(quiz.title)});`,
    );
  }

  for (const lure of topic.lures) {
    lures.push(
      `INSERT INTO phishing_templates (id,title,category,difficulty_tier,industry_tag,subject_line,body_html,sender_spoof_name,red_flags,source,created_at) ` +
        `SELECT gen_random_uuid(),${q(lure.title)},${q(lure.category)},${q(lure.difficultyTier)},${lure.industryTag ? q(lure.industryTag) : 'NULL'},${q(lure.subjectLine)},${q(lure.bodyHtml)},${q(lure.senderSpoofName)},${arr(lure.redFlags)},${q(SOURCE)},now() ` +
        `WHERE NOT EXISTS (SELECT 1 FROM phishing_templates WHERE title=${q(lure.title)});`,
    );
  }
}

writeFileSync('/tmp/iso-modules.sql', modules.join('\n') + '\n');
writeFileSync('/tmp/iso-quizzes.sql', quizzes.join('\n') + '\n');
writeFileSync('/tmp/iso-lures.sql', lures.join('\n') + '\n');
console.log(`emitted: modules ${modules.length}, quizzes ${quizzes.length}, lures ${lures.length}`);
