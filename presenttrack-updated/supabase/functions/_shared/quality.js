// Recording / recognition quality gate. Pure.
import { CRITERIA } from './criteria.js';

const r2 = (n) => Math.round(n * 100) / 100;

// segments: Whisper verbose_json segments. Missing fields are tolerated.
export function assessQuality(metrics, segments = [], criteria = CRITERIA) {
  const q = criteria.quality;
  const segs = Array.isArray(segments) ? segments : [];
  const warnings = [];

  const num = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);
  const probs = segs.map((s) => Math.exp(num(s && s.avg_logprob))).filter((p) => Number.isFinite(p));
  const confidence = probs.length ? r2(Math.min(1, probs.reduce((a, b) => a + b, 0) / probs.length)) : null;

  const nsVals = segs.map((s) => num(s && s.no_speech_prob)).filter((p) => Number.isFinite(p));
  const nsShare = nsVals.length ? nsVals.filter((p) => p > q.noSpeechProb).length / nsVals.length : 0;

  const total = Number(metrics && metrics.totalDurationSec) || 0;
  const coverage = total > 0 ? (Number(metrics && metrics.speakingDurationSec) || 0) / total : 0;
  const words = Number(metrics && metrics.words) || 0;

  let level = 'ok';
  if (words < q.minWords) {
    level = 'unusable';
    warnings.push(`We could only recognize ${words} words (at least ${q.minWords} are needed). The recording may be too quiet, too short, or mostly silent.`);
  } else if (coverage < q.minSpeechCoverage) {
    level = 'unusable';
    warnings.push('Speech seems to cover only a small part of the recording, so the results would not be meaningful.');
  } else if (nsShare >= q.noSpeechSegmentShare) {
    level = 'unusable';
    warnings.push('Most of the recording was detected as silence or background noise.');
  } else if (confidence !== null && confidence < q.lowConfidence) {
    level = 'low';
    warnings.push('The speech recognizer was not very confident about this recording (background noise, low volume, or accent can affect it). Some word counts may be inaccurate, so treat the results as approximate. A retake in a quieter place may give a more reliable baseline.');
  }
  if (level !== 'unusable') {
    warnings.push('Automatic transcription can miss or add words, so filler and pause counts are estimates, not definite speaking mistakes.');
  }
  return { level, confidence, speechCoverage: r2(coverage), noSpeechShare: r2(nsShare), warnings };
}
