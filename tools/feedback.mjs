#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';

const args = process.argv.slice(2);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
let query;
if (args[0] === '--resolve') {
  const revision = args[1];
  const ids = args.slice(2);
  if (!revision || !/^[a-zA-Z0-9._-]{1,100}$/.test(revision) || !ids.length || ids.some(id => !/^[a-f0-9-]{36}$/i.test(id))) {
    throw new Error('Usage: npm run feedback:pull -- --resolve <deployed-revision> <feedback-uuid> ...');
  }
  query = `UPDATE feedback SET status='addressed', resolved_at=datetime('now'), resolved_revision=${quote(revision)} WHERE id IN (${ids.map(quote).join(',')}) AND status='open'; SELECT id, status, resolved_revision FROM feedback WHERE id IN (${ids.map(quote).join(',')});`;
} else {
  query = `SELECT id, slide_id, slide_title, deck_revision, author, comment, status, created_at, resolved_revision FROM feedback ${args.includes('--all') ? '' : "WHERE status='open'"} ORDER BY created_at ASC LIMIT 200;`;
}
const result = spawnSync(process.env.WRANGLER_BIN || 'wrangler', ['d1', 'execute', 'FEEDBACK', '--remote', '--json', '--command', query], {encoding: 'utf8'});
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}
let payload;
try { payload = JSON.parse(result.stdout); } catch { throw new Error('Cloudflare returned an unexpected response. No local review file was changed.'); }
const rows = payload.flatMap(item => item.results || []);
if (args[0] !== '--resolve') {
  mkdirSync('.review', {recursive: true});
  writeFileSync('.review/feedback.json', JSON.stringify({retrievedAt: new Date().toISOString(), feedback: rows}, null, 2) + '\n');
}
console.log(JSON.stringify(rows, null, 2));
console.error(args[0] === '--resolve' ? `Updated ${rows.length} feedback record(s).` : `${rows.length} comment(s) retrieved into .review/feedback.json.`);
