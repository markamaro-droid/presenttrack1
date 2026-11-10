import { test } from 'node:test'; import assert from 'node:assert/strict';
import { analyze } from '../lib/analysis/metrics';
const mk = (s: string, t0 = 0, dt = 0.4) => s.split(' ').map((word, i) => ({ word, start: t0 + i * dt, end: t0 + i * dt + 0.3 }));

test('silence returns no_speech, no fabricated numbers', () => {
  const r = analyze([], 30); assert.equal(r.paceLabel, 'no_speech'); assert.equal(r.wpm, null);
});
test('fillers counted; verb/comparison "like" is not', () => {
  const r = analyze(mk('um so we like went uh there and you know I like the idea'), 10);
  assert.equal(r.fillerCounts['um'], 1); assert.equal(r.fillerCounts['uh'], 1);
  assert.equal(r.fillerCounts['you know'], 1); assert.equal(r.fillerCounts['like'], 1);
});
test('long pause detected and removed from speech-active time', () => {
  const r = analyze([...mk('one two three four', 0), ...mk('five six seven eight', 6)], 12);
  assert.equal(r.longPauseCount, 1); assert.ok(r.longPauseSeconds > 3); assert.ok(r.wpm! > r.overallWpm!);
});
test('excluded slide-transition gap is ignored', () => {
  const r = analyze([...mk('one two', 0), ...mk('three four', 6)], 10, { targetMin: 120, targetMax: 160, longPauseSeconds: 2, excludeIntervals: [[1, 6]] });
  assert.equal(r.longPauseCount, 0);
});
test('pace label follows configurable range', () => {
  const r = analyze(mk('a b c d e f g h i j', 0, 0.2), 3, { targetMin: 120, targetMax: 160, longPauseSeconds: 2 });
  assert.equal(r.paceLabel, 'fast');
});
