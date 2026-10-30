import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from '../functions/_shared/metrics.js';
import { assessQuality } from '../functions/_shared/quality.js';
import { plain } from './helpers.js';

const segs = (lp, ns = 0.01, n = 5) => Array.from({ length: n }, () => ({ avg_logprob: lp, no_speech_prob: ns }));

test('ok', () => {
  const m = computeMetrics({ words: plain(300, { gap: 0.1 }), totalDurationSec: 130 });
  const q = assessQuality(m, segs(-0.2));
  assert.equal(q.level, 'ok');
  assert.ok(q.confidence > 0.8 && q.confidence <= 1);
});
test('unusable: too few words', () => {
  const m = computeMetrics({ words: plain(10), totalDurationSec: 60 });
  assert.equal(assessQuality(m, segs(-0.2)).level, 'unusable');
});
test('unusable: speech covers little of recording', () => {
  const m = computeMetrics({ words: plain(60, { gap: 0.1 }), totalDurationSec: 600 });
  const q = assessQuality(m, segs(-0.2));
  assert.equal(q.level, 'unusable');
});
test('unusable: no-speech dominant', () => {
  const m = computeMetrics({ words: plain(200), totalDurationSec: 100 });
  assert.equal(assessQuality(m, segs(-0.2, 0.9)).level, 'unusable');
});
test('low confidence', () => {
  const m = computeMetrics({ words: plain(200), totalDurationSec: 100 });
  const q = assessQuality(m, segs(-1.5));
  assert.equal(q.level, 'low');
  assert.ok(q.warnings.join(' ').match(/approximate/i));
});
test('missing segment fields tolerated; warnings never claim definite mistakes', () => {
  const m = computeMetrics({ words: plain(200), totalDurationSec: 100 });
  const q = assessQuality(m, [{}, null, undefined]);
  assert.equal(q.level, 'ok');
  assert.equal(q.confidence, null);
  assert.ok(q.warnings.join(' ').match(/estimates/));
});
