import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.js';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_feedback.sql', import.meta.url), 'utf8'));
  return {
    db,
    binding: {prepare(sql) {return {bind(...values) {return {async run() {return db.prepare(sql).run(...values);}, async first() {return db.prepare(sql).get(...values);}};}};}},
  };
}
const makeBody = overrides => ({submissionKey: crypto.randomUUID(), slideId: '01-abundance', revision: 'deck-test', author: 'Design reviewer', comment: 'Please add more space above the illustration.', ...overrides});
const request = body => new Request('https://example.com/api/feedback', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://example.com'}, body: JSON.stringify(body)});

test('feedback is saved with its exact slide, revision and comment, and retries are idempotent', async () => {
  const {db, binding} = database();
  const body = makeBody({comment: "Please retain this exactly: <script>literal text</script> & ‘curly quotes’."});
  const first = await worker.fetch(request(body), {FEEDBACK: binding});
  assert.equal(first.status, 201);
  const receipt = await first.json();
  assert.equal(receipt.ok, true);
  const second = await worker.fetch(request(body), {FEEDBACK: binding});
  assert.equal((await second.json()).id, receipt.id);
  const rows = db.prepare('SELECT * FROM feedback').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].comment, body.comment);
  assert.equal(rows[0].slide_id, body.slideId);
  assert.equal(rows[0].deck_revision, body.revision);
  assert.equal(rows[0].status, 'open');
  db.close();
});

test('invalid or oversized submissions do not create records', async () => {
  const {db, binding} = database();
  for (const changes of [{comment: ' '}, {comment: 'x'.repeat(4001)}, {slideId: 'unknown'}, {author: 'a'.repeat(81)}, {submissionKey: 'not-a-uuid'}, {revision: ''}, {website: 'https://spam.example'}]) {
    assert.equal((await worker.fetch(request(makeBody(changes)), {FEEDBACK: binding})).status, 400);
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM feedback').get().n, 0);
  db.close();
});

test('comments cannot be read through the public API, and cross-origin submissions fail', async () => {
  const {db, binding} = database();
  const publicRead = await worker.fetch(new Request('https://example.com/api/feedback'), {FEEDBACK: binding});
  assert.equal(publicRead.status, 405);
  const crossOrigin = new Request(request(makeBody()), {headers: {'Content-Type': 'application/json', Origin: 'https://another.example'}});
  assert.equal((await worker.fetch(crossOrigin, {FEEDBACK: binding})).status, 403);
  db.close();
});

test('a storage outage reports failure instead of claiming the comment was saved', async () => {
  const unavailable = await worker.fetch(request(makeBody()), {});
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).ok, undefined);
});
