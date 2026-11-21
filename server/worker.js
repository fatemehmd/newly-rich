import deck from '../dist/slides.json' with {type: 'json'};

const slideTitles = new Map(deck.slides.map(slide => [slide.id, slide.title]));
const response = (data, status = 200) => Response.json(data, {
  status,
  headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
});

export async function submitFeedback(request, env) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return response({error: 'Please submit feedback from this website.'}, 403);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return response({error: 'Expected a JSON submission.'}, 415);
  if (Number(request.headers.get('Content-Length') || 0) > 24000) return response({error: 'Your comment is too long.'}, 413);
  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 24000) return response({error: 'Your comment is too long.'}, 413);
    body = JSON.parse(raw);
  } catch {
    return response({error: 'Your submission could not be read. Please try again.'}, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return response({error: 'Invalid submission.'}, 400);
  // An invisible honeypot catches basic form bots without adding a challenge.
  if (body.website) return response({error: 'Your submission could not be accepted.'}, 400);
  const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
  const author = typeof body.author === 'string' ? body.author.trim() : '';
  const slideId = body.slideId;
  const revision = typeof body.revision === 'string' ? body.revision.trim() : '';
  const submissionKey = body.submissionKey;
  if (comment.length < 2 || comment.length > 4000) return response({error: 'Please enter a comment between 2 and 4,000 characters.'}, 400);
  if (author.length > 80) return response({error: 'Please shorten the name to 80 characters.'}, 400);
  if (slideId !== 'general' && !slideTitles.has(slideId)) return response({error: 'Please choose a slide from the list.'}, 400);
  if (!revision || revision.length > 100 || !/^[a-zA-Z0-9._-]+$/.test(revision)) return response({error: 'Please reload the page before submitting.'}, 400);
  if (typeof submissionKey !== 'string' || !/^[a-f0-9-]{36}$/i.test(submissionKey)) return response({error: 'Please reload the form and try again.'}, 400);
  if (!env.FEEDBACK) return response({error: 'Feedback is temporarily unavailable. Your comment is still in this browser.'}, 503);
  const id = crypto.randomUUID();
  const created = new Date().toISOString();
  const title = slideId === 'general' ? 'General feedback' : slideTitles.get(slideId);
  try {
    await env.FEEDBACK.prepare(`INSERT INTO feedback
      (id, submission_key, slide_id, slide_title, deck_revision, author, comment, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(submission_key) DO NOTHING`)
      .bind(id, submissionKey, slideId, title, revision, author, comment, created).run();
    const receipt = await env.FEEDBACK.prepare('SELECT id, created_at FROM feedback WHERE submission_key = ?1').bind(submissionKey).first();
    return response({ok: true, id: receipt.id, createdAt: receipt.created_at}, 201);
  } catch (error) {
    console.error('Feedback storage failed', error?.name || 'Error');
    return response({error: 'We couldn’t save that comment. Please try again; your text has been kept.'}, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') return response({ok: true, revision: deck.revision, slides: deck.slides.length});
    if (url.pathname === '/api/feedback') {
      if (request.method !== 'POST') return response({error: 'Method not allowed.'}, 405);
      return submitFeedback(request, env);
    }
    if (url.pathname.startsWith('/api/')) return response({error: 'Not found.'}, 404);
    return env.ASSETS.fetch(request);
  },
};
