import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from '../functions/_shared/metrics.js';
import { seq, plain } from './helpers.js';

test('empty input has no NaN', () => {
  for (const inp of [undefined, {}, { words: [] }, { words: null }, { words: [{ word: 'x' }] }]) {
    const m = computeMetrics(inp);
    for (const v of Object.values(m)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
    assert.equal(m.words, 0); assert.equal(m.wpm, 0); assert.equal(m.fillerCount, 0);
  }
});

test('wpm formula: words / speaking minutes', () => {
  // 60 words, 0.3 dur + 0.2 gap => span = 60*0.5-0.2 = 29.8s
  const m = computeMetrics({ words: plain(60, { gap: 0.2 }), totalDurationSec: 60 });
  assert.equal(m.words, 60);
  assert.equal(m.speakingDurationSec, 29.8);
  assert.equal(m.wpm, Math.round((60 / (29.8 / 60)) * 10) / 10);
  assert.equal(m.overallWpm, 60);
  assert.equal(m.pauseCount, 0);
});

test('long pauses (>=2s) are excluded from speaking time; short ones are not', () => {
  const a = plain(10, { start: 0, gap: 0.1 });          // ends 3.9
  const b = plain(10, { start: 3.9 + 2.0 });            // gap exactly 2.0 -> long
  const c = plain(10, { start: 6.0 + 1.9 + 3.9 + 2.0 - 1.9 }); // dummy to be overwritten
  const words = [...a, ...b];
  const m = computeMetrics({ words, totalDurationSec: 20 });
  assert.equal(m.pauseCount, 1);
  assert.equal(m.pauses[0].dur, 2);
  assert.equal(m.longestPause, 2);
  const span = words.at(-1).end - words[0].start;
  assert.equal(m.speakingDurationSec, Math.round((span - 2) * 100) / 100);
  // short 1.9s gap counts as speaking time
  const short = computeMetrics({ words: [...a, ...plain(10, { start: 3.9 + 1.9 })], totalDurationSec: 20 });
  assert.equal(short.pauseCount, 0);
  void c;
});

test('filler detection: um/uh/ano and punctuation/case', () => {
  const m = computeMetrics({ words: seq(['Um,', 'I', 'think', 'uh', 'this', 'is', 'Ano.', 'good']), totalDurationSec: 10 });
  assert.equal(m.fillerCount, 3);
  assert.deepEqual(m.fillerByWord, { um: 1, uh: 1, ano: 1 });
  assert.equal(m.fillers[0].t, 0);
});

test('"you know" counted once as a phrase; skipped after "do"', () => {
  const m = computeMetrics({ words: seq(['it', 'is', 'you', 'know', 'nice', 'do', 'you', 'know', 'him']) });
  assert.equal(m.fillerByWord['you know'], 1);
  assert.equal(m.fillerCount, 1);
  assert.equal(m.words, 9);
});

test('"like" heuristic', () => {
  const f = (s) => computeMetrics({ words: seq(s.split(' ')) }).fillerCount;
  assert.equal(f('i like pizza'), 0);
  assert.equal(f('they like it'), 0);
  assert.equal(f('it looks like rain'), 0);
  assert.equal(f('i would like to go'), 0);
  assert.equal(f('we feel like winners'), 0);
  assert.equal(f('so it was like really good'), 1);
  const m = computeMetrics({ words: seq('so it was like really good'.split(' ')) });
  assert.equal(m.heuristicFillerCount, 1);
  assert.equal(m.fillers[0].heuristic, true);
  assert.equal(f('this is like to be'), 0);
});

test('unsorted / invalid words tolerated', () => {
  const m = computeMetrics({ words: [{ word: 'b', start: 1, end: 1.2 }, { word: 'a', start: 0, end: 0.2 }, { word: '', start: 2, end: 3 }, { word: 'c', start: 'x', end: 3 }] });
  assert.equal(m.words, 2);
});
