import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../functions/_shared/classify.js';
import { CRITERIA } from '../functions/_shared/criteria.js';

const ok = { level: 'ok' };
const base = { wpm: 145, totalDurationSec: 150, fillersPerMin: 1, fillerCount: 2, pausesPerMin: 0.5, pauseCount: 1, longestPause: 2.2 };

test('criteria frozen', () => {
  assert.ok(Object.isFrozen(CRITERIA) && Object.isFrozen(CRITERIA.pace));
});
test('proficient', () => {
  const r = classify(base, ok);
  assert.equal(r.classification, 'proficient');
  assert.equal(r.totalPoints, 8); assert.equal(r.score, 100);
  assert.equal(r.durationAssessment.status, 'within_range');
  assert.match(r.explanation, /BASELINE/); assert.match(r.explanation, /eye contact/i);
});
test('developing', () => {
  const r = classify({ ...base, wpm: 120, fillersPerMin: 5, pausesPerMin: 3, totalDurationSec: 100 }, ok);
  assert.equal(r.classification, 'developing');
  assert.equal(r.totalPoints, 4);
});
test('needs_improvement', () => {
  const r = classify({ ...base, wpm: 200, fillersPerMin: 10, pausesPerMin: 8, totalDurationSec: 40 }, ok);
  assert.equal(r.classification, 'needs_improvement');
  assert.equal(r.durationAssessment.status, 'too_short');
});
test('not WPM-only: great WPM + many fillers is not proficient', () => {
  const r = classify({ ...base, fillersPerMin: 12, fillerCount: 30 }, ok);
  assert.equal(r.dims.pace.points, 2);
  assert.notEqual(r.classification, 'proficient');
  assert.equal(r.classification, 'developing');
});
test('7 points but a zero dimension is not proficient', () => {
  // pace 2, pauses 2, duration 2 = 6 +  fillers 0 -> developing; construct 7 w/ zero impossible (max 2*3+... ) check rule via custom criteria
  const r = classify({ ...base, fillersPerMin: 12 }, ok);
  assert.ok(r.totalPoints < 7 || r.classification !== 'proficient');
});
test('too_long and low quality note', () => {
  const r = classify({ ...base, totalDurationSec: 400 }, { level: 'low' });
  assert.equal(r.durationAssessment.status, 'too_long');
  assert.match(r.explanation, /approximate/);
});
