import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedback, ruleBasedFeedback } from '../functions/_shared/feedback.js';
import { classify } from '../functions/_shared/classify.js';

test('validateFeedback rejects junk', () => {
  for (const v of [null, 'x', [], {}, { summary: 5 }, { summary: '  ' }, { summary: 'ok' }]) assert.equal(validateFeedback(v), null);
});
test('validateFeedback clamps and strips', () => {
  const out = validateFeedback({
    summary: 'a\u0000b'.repeat(500),
    strengths: ['good', 5, null, 'x'.repeat(1000), 'a', 'b', 'c', 'd'],
    improvements: 'nope',
    recommendations: ['do this'],
    extra: 'dropped',
  });
  assert.ok(out.summary.length <= 600 && !/\u0000/.test(out.summary));
  assert.equal(out.strengths.length, 5);
  assert.ok(out.strengths.every((s) => typeof s === 'string' && s.length <= 240));
  assert.deepEqual(out.improvements, []);
  assert.equal(out.extra, undefined);
});
test('ruleBasedFeedback always yields valid feedback and hedges', () => {
  const m = { wpm: 200, fillerCount: 20, pauseCount: 9, totalDurationSec: 60 };
  const r = classify({ ...m, fillersPerMin: 12, pausesPerMin: 9 }, { level: 'ok' });
  const fb = ruleBasedFeedback(m, r);
  assert.ok(validateFeedback(fb));
  assert.match(fb.summary, /baseline/i);
  assert.ok(fb.improvements.length >= 3);
  assert.ok(!/eye contact|gesture/i.test(JSON.stringify(fb)));
  assert.ok(validateFeedback(ruleBasedFeedback({}, null)));
});
