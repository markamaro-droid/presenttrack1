import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { validateDeckContent, buildDeck } from '../functions/_shared/deck.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const sample = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/deck-sample.json'), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(sample));
const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;

test('valid sample passes', () => {
  const v = validateDeckContent(sample);
  assert.ok(v.ok, v.errors.join(';'));
  assert.equal(v.content.slides.length, 6);
});
test('rejections', () => {
  const bad = [];
  let d = clone(); d.slides = d.slides.slice(0, 4); bad.push(d);
  d = clone(); d.slides.push(d.slides[2], d.slides[2]); bad.push(d);
  d = clone(); d.slides[1].title = 'x'.repeat(61); bad.push(d);
  d = clone(); d.slides[2].bullets = ['only one']; bad.push(d);
  d = clone(); d.slides[2].bullets[0] = 'y'.repeat(91); bad.push(d);
  d = clone(); d.slides[0].kind = 'point'; bad.push(d);
  d = clone(); d.slides[5].kind = 'point'; bad.push(d);
  d = clone(); d.slides[4].kind = 'point'; bad.push(d); // no example
  d = clone(); delete d.guidelines; bad.push(d);
  bad.push(null, 'x', []);
  for (const b of bad) assert.equal(validateDeckContent(b).ok, false);
});
test('control chars stripped', () => {
  const d = clone(); d.slides[1].title = 'Hi\u0000\u0007 there'; d.slides[1].notes = 'a\u001Fb';
  const v = validateDeckContent(d);
  assert.ok(v.ok); assert.equal(v.content.slides[1].title, 'Hi there'); assert.equal(v.content.slides[1].notes, 'a b');
});

test('builds a real .pptx that opens (zip, python-pptx, libreoffice)', async (t) => {
  let PptxGenJS;
  try { PptxGenJS = createRequire(import.meta.url)('pptxgenjs'); } catch { return t.skip('pptxgenjs not resolvable (set NODE_PATH)'); }
  const out = process.env.DECK_OUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'));
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, 'assessment.pptx');
  const content = validateDeckContent(sample).content;
  const pres = buildDeck(PptxGenJS, content);
  const bytes = await pres.write({ outputType: 'uint8array' });
  fs.writeFileSync(file, bytes);
  assert.ok(fs.statSync(file).size > 10000);

  if (has('unzip')) assert.equal(spawnSync('unzip', ['-tq', file]).status, 0, 'unzip -t');
  else t.diagnostic('unzip missing');

  const py = spawnSync('python3', ['-I', '-c', `
import sys
from pptx import Presentation
p = Presentation(sys.argv[1])
n = len(p.slides)
assert 5 <= n <= 7, n
notes = [s.notes_slide.notes_text_frame.text for s in p.slides if s.has_notes_slide]
assert len(notes) == n and all(notes), notes
assert p.slide_width / p.slide_height > 1.7
vis = ' '.join(sh.text_frame.text for s in p.slides for sh in s.shapes if sh.has_text_frame)
assert 'Welcome everyone' not in vis
sizes = [r.font.size.pt for s in p.slides for sh in s.shapes if sh.has_text_frame for para in sh.text_frame.paragraphs for r in para.runs if r.font.size]
assert min(sizes) >= 20, min(sizes)
print('OK', n)
`, file]);
  if (py.status !== 0 && /No module named/.test(String(py.stderr))) t.diagnostic('python-pptx missing');
  else assert.equal(py.status, 0, String(py.stderr));

  if (has('soffice')) {
    const r = spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, file], { timeout: 180000 });
    assert.equal(r.status, 0, String(r.stderr));
    assert.ok(fs.existsSync(path.join(out, 'assessment.pdf')));
  } else t.diagnostic('soffice missing');
});
