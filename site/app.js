const $ = selector => document.querySelector(selector);
const image = $('#slide-image');
const stage = $('#slide-stage');
const form = $('#feedback-form');
const slideSelect = $('#feedback-slide');
const authorInput = $('#feedback-author');
const commentInput = $('#feedback-comment');
const feedbackStatus = $('#feedback-status');
const submit = $('#submit-feedback');
const previous = $('#previous');
const next = $('#next');
const feedbackLink = $('#leave-feedback');
let deck;
let index = 0;
let feedbackOpen = false;
let draftKey = '';
let submissionKey = '';
let submitting = false;
const preloaded = new Set();

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

function preload(slide) {
  if (!slide || preloaded.has(slide.image)) return;
  preloaded.add(slide.image);
  const img = new Image();
  img.src = slide.image;
}

function navigate(path) {
  history.pushState(null, '', path);
  renderRoute();
}

function slidePath(i) {
  return i === 0 ? '/' : `/slide/${deck.slides[i].id}`;
}

function openFeedback() {
  navigate(`/feedback?slide=${deck.slides[index].id}`);
}

function changeSlide(direction) {
  if (!deck) return;
  if (feedbackOpen) {
    if (direction < 0) navigate(slidePath(index));
    return;
  }
  if (index + direction >= deck.slides.length) return openFeedback();
  if (index + direction < 0) return;
  navigate(slidePath(index + direction));
}

function draftId(slideId) {
  return `newly-rich:draft:${deck.revision}:${slideId}`;
}

function saveDraft() {
  if (!draftKey || submitting) return;
  storage.set(draftKey, JSON.stringify({comment: commentInput.value, submissionKey}));
  storage.set('newly-rich:reviewer', authorInput.value);
}

function loadDraft() {
  draftKey = draftId(slideSelect.value);
  let draft;
  try { draft = JSON.parse(storage.get(draftKey)); } catch {}
  commentInput.value = draft?.comment || '';
  submissionKey = draft?.submissionKey || crypto.randomUUID();
  feedbackStatus.textContent = '';
  delete feedbackStatus.dataset.state;
}

function renderRoute() {
  const url = new URL(location.href);
  feedbackOpen = url.pathname.replace(/\/$/, '') === '/feedback';
  const id = feedbackOpen ? url.searchParams.get('slide') : decodeURIComponent(url.pathname.split('/slide/')[1] || '');
  const found = deck.slides.findIndex(slide => slide.id === id);
  index = found >= 0 ? found : feedbackOpen ? deck.slides.length - 1 : 0;
  $('#slideshow').hidden = feedbackOpen;
  $('#feedback-page').hidden = !feedbackOpen;
  document.body.dataset.page = feedbackOpen ? 'feedback' : 'slide';
  previous.disabled = !feedbackOpen && index === 0;
  next.disabled = feedbackOpen;
  next.setAttribute('aria-label', index === deck.slides.length - 1 ? 'Next: feedback page' : 'Next slide');
  feedbackLink.hidden = feedbackOpen;
  feedbackLink.href = `/feedback?slide=${deck.slides[index].id}`;
  if (feedbackOpen) {
    document.title = 'Feedback — A Field Guide for the Newly Rich';
    $('#page-count').textContent = 'Feedback';
    slideSelect.value = id && deck.slides.some(slide => slide.id === id) ? id : 'general';
    authorInput.value = storage.get('newly-rich:reviewer') || '';
    loadDraft();
    window.scrollTo(0, 0);
    return;
  }
  const slide = deck.slides[index];
  document.title = `${slide.title} — Newly Rich`;
  $('#page-count').textContent = `${index + 1} / ${deck.slides.length}`;
  $('#slide-announcement').textContent = `${index + 1} of ${deck.slides.length}: ${slide.title}`;
  $('#image-error').hidden = true;
  image.alt = `${slide.title}. Slide ${index + 1} of ${deck.slides.length}.`;
  if (image.getAttribute('src') !== slide.image) {
    stage.setAttribute('aria-busy', 'true');
    image.src = slide.image;
  } else if (image.complete && image.naturalWidth) stage.setAttribute('aria-busy', 'false');
  preload(deck.slides[index + 1]);
  preload(deck.slides[index - 1]);
  window.scrollTo(0, 0);
}

image.addEventListener('load', () => stage.setAttribute('aria-busy', 'false'));
image.addEventListener('error', () => {
  stage.setAttribute('aria-busy', 'false');
  $('#image-error').hidden = false;
});
$('#retry-image').addEventListener('click', () => {
  if (!deck) { start(); return; }
  $('#image-error').hidden = true;
  stage.setAttribute('aria-busy', 'true');
  image.src = `${deck.slides[index].image}?retry=${Date.now()}`;
});
previous.addEventListener('click', () => changeSlide(-1));
next.addEventListener('click', () => changeSlide(1));
feedbackLink.addEventListener('click', event => { event.preventDefault(); openFeedback(); });
window.addEventListener('popstate', () => deck && renderRoute());
document.addEventListener('keydown', event => {
  if (!deck || event.altKey || event.metaKey || event.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); changeSlide(1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); changeSlide(-1); }
  if (event.key === 'Home' && !feedbackOpen) { event.preventDefault(); navigate(slidePath(0)); }
  if (event.key === 'End' && !feedbackOpen) { event.preventDefault(); navigate(slidePath(deck.slides.length - 1)); }
  if (event.key.toLowerCase() === 'f' && !feedbackOpen) { event.preventDefault(); openFeedback(); }
});

let touchStart;
stage.addEventListener('touchstart', event => {
  touchStart = event.touches.length === 1 && (window.visualViewport?.scale || 1) <= 1.05 ? {x: event.touches[0].clientX, y: event.touches[0].clientY} : null;
}, {passive: true});
stage.addEventListener('touchend', event => {
  if (!touchStart || !event.changedTouches[0]) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) changeSlide(dx < 0 ? 1 : -1);
}, {passive: true});
stage.addEventListener('touchcancel', () => { touchStart = null; }, {passive: true});

slideSelect.addEventListener('change', () => { saveDraft(); loadDraft(); });
for (const input of [authorInput, commentInput]) input.addEventListener('input', () => { submissionKey = crypto.randomUUID(); saveDraft(); });

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || !form.reportValidity()) return;
  saveDraft();
  submitting = true;
  submit.disabled = true;
  submit.textContent = 'Submitting…';
  slideSelect.disabled = true;
  commentInput.readOnly = authorInput.readOnly = true;
  feedbackStatus.textContent = '';
  delete feedbackStatus.dataset.state;
  const sentDraftKey = draftKey;
  try {
    const result = await fetch('/api/feedback', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({submissionKey, slideId: slideSelect.value, author: authorInput.value, comment: commentInput.value, revision: deck.revision, website: $('#feedback-website').value}),
      signal: AbortSignal.timeout(20000),
    });
    const receipt = await result.json();
    if (!result.ok || !receipt.ok) throw new Error(receipt.error || 'Your note couldn’t be saved. Please try again.');
    storage.remove(sentDraftKey);
    if (draftKey === sentDraftKey) {
      commentInput.value = '';
      submissionKey = crypto.randomUUID();
      feedbackStatus.textContent = `Thank you. Your feedback has been saved for review. Reference ${receipt.id.slice(0, 8)}.`;
      feedbackStatus.dataset.state = 'success';
    }
  } catch (error) {
    feedbackStatus.textContent = error.name === 'TimeoutError' ? 'The connection timed out. Your text is kept here; please try submitting again.' : error.message || 'Please check your connection and try again. Your text is kept here.';
    feedbackStatus.dataset.state = 'error';
  } finally {
    submitting = false;
    submit.disabled = false;
    submit.textContent = 'Submit feedback';
    slideSelect.disabled = false;
    commentInput.readOnly = authorInput.readOnly = false;
  }
});

async function start() {
  try {
    const result = await fetch('/slides.json', {cache: 'no-cache'});
    if (!result.ok) throw new Error('The guide could not load. Please refresh the page.');
    deck = await result.json();
    const options = [new Option('The guide as a whole', 'general'), ...deck.slides.map((slide, i) => new Option(`${String(i + 1).padStart(2, '0')} · ${slide.title}`, slide.id))];
    slideSelect.replaceChildren(...options);
    renderRoute();
  } catch (error) {
    stage.setAttribute('aria-busy', 'false');
    $('#image-error').hidden = false;
    $('#image-error').firstChild.textContent = error.message + ' ';
  }
}
start();
