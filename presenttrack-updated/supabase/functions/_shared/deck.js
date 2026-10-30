// Deck content validation + PPTX construction. Pure: PptxGenJS constructor is injected.
export const DECK_LIMITS = { minSlides: 5, maxSlides: 7, titleMax: 60, bulletMax: 90, minBullets: 2, maxBullets: 4, notesMax: 600 };
const KINDS = ['title', 'intro', 'point', 'example', 'conclusion'];

export function stripControl(s, max) {
  const t = String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  return max ? t.slice(0, max) : t;
}

// Returns { ok, errors, content }. content is the sanitized copy (only when ok).
export function validateDeckContent(obj) {
  const errors = [];
  const L = DECK_LIMITS;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['not an object'] };
  const str = (v) => (typeof v === 'string' ? stripControl(v) : '');

  const title = str(obj.title);
  const topic = str(obj.topic);
  if (!title || title.length > 80) errors.push('title missing or > 80 chars');
  if (!topic || topic.length > 100) errors.push('topic missing or > 100 chars');

  const slides = [];
  if (!Array.isArray(obj.slides) || obj.slides.length < L.minSlides || obj.slides.length > L.maxSlides) {
    errors.push(`slides must be ${L.minSlides}-${L.maxSlides}`);
  } else {
    obj.slides.forEach((s, i) => {
      if (!s || typeof s !== 'object') { errors.push(`slide ${i}: not an object`); return; }
      const kind = str(s.kind);
      const st = str(s.title);
      if (!KINDS.includes(kind)) errors.push(`slide ${i}: bad kind`);
      if (!st || st.length > L.titleMax) errors.push(`slide ${i}: title missing or > ${L.titleMax}`);
      const bullets = Array.isArray(s.bullets) ? s.bullets : [];
      if (bullets.length < L.minBullets || bullets.length > L.maxBullets) errors.push(`slide ${i}: bullets must be ${L.minBullets}-${L.maxBullets}`);
      const cb = bullets.map((b) => (typeof b === 'string' ? stripControl(b) : ''));
      if (cb.some((b) => !b || b.length > L.bulletMax)) errors.push(`slide ${i}: bullet empty or > ${L.bulletMax}`);
      const notes = typeof s.notes === 'string' ? stripControl(s.notes, L.notesMax) : '';
      slides.push({ kind, title: st, bullets: cb, notes });
    });
    if (!errors.length) {
      const kinds = slides.map((s) => s.kind);
      if (kinds[0] !== 'title') errors.push('first slide must be title');
      if (kinds[kinds.length - 1] !== 'conclusion') errors.push('last slide must be conclusion');
      ['intro', 'point', 'example'].forEach((k) => { if (!kinds.includes(k)) errors.push(`missing ${k} slide`); });
    }
  }

  const g = obj.guidelines;
  let guidelines = null;
  if (!g || typeof g !== 'object') errors.push('guidelines missing');
  else {
    const arr = (v, min, max, len) => {
      const a = (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string').map((x) => stripControl(x, len)).filter(Boolean);
      if (a.length < min || a.length > max) errors.push('guideline list size');
      return a.slice(0, max);
    };
    const overview = str(g.overview).slice(0, 400);
    if (!overview) errors.push('guidelines.overview missing');
    const mins = Number(g.estimatedMinutes);
    if (!Number.isFinite(mins) || mins < 1 || mins > 5) errors.push('guidelines.estimatedMinutes out of range');
    guidelines = { overview, estimatedMinutes: mins, tips: arr(g.tips, 2, 5, 160), instructions: arr(g.instructions, 2, 6, 160) };
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], content: { title, topic, slides, guidelines } };
}

const NAVY = '0A3466';
const BLUE = '1570D0';
const FONT = 'Calibri';

// Returns the configured pptx object; the caller does `.write(...)`.
export function buildDeck(PptxGenJS, content) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9'; // 10 x 5.625 in
  pres.title = content.title;
  pres.author = 'PresentTrack';

  content.slides.forEach((s, i) => {
    const slide = pres.addSlide();
    if (s.kind === 'title') {
      slide.background = { color: NAVY };
      slide.addShape('rect', { x: 0.6, y: 2.35, w: 1.2, h: 0.08, fill: { color: BLUE }, line: { color: BLUE } });
      slide.addText(s.title, { x: 0.6, y: 0.7, w: 8.8, h: 1.6, fontFace: FONT, fontSize: 40, bold: true, color: 'FFFFFF', valign: 'bottom', margin: 0 });
      slide.addText(s.bullets.map((b) => ({ text: b, options: { breakLine: true } })), {
        x: 0.6, y: 2.6, w: 8.8, h: 2.4, fontFace: FONT, fontSize: 22, color: 'DCE9F8', valign: 'top', margin: 0, paraSpaceAfter: 6,
      });
    } else {
      slide.background = { color: 'FFFFFF' };
      slide.addShape('rect', { x: 0, y: 0, w: 10, h: 0.18, fill: { color: BLUE }, line: { color: BLUE } });
      slide.addText(s.title, { x: 0.6, y: 0.4, w: 8.8, h: 1.3, fontFace: FONT, fontSize: 36, bold: true, color: NAVY, valign: 'middle', margin: 0 });
      slide.addText(s.bullets.map((b) => ({ text: b, options: { bullet: { code: '25A0' }, breakLine: true } })), {
        x: 0.6, y: 1.85, w: 8.8, h: 3.4, fontFace: FONT, fontSize: 22, color: '1F2937', valign: 'top', margin: 0, paraSpaceAfter: 10,
      });
    }
    if (s.notes) slide.addNotes(s.notes);
  });
  return pres;
}
