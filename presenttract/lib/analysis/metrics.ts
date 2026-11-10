// Pure, provider-agnostic speech metrics. Input must be real timestamps from STT; nothing is fabricated.
export type Word = { word: string; start: number; end: number };
export type Config = {
  targetMin: number; targetMax: number;
  longPauseSeconds: number;
  excludeIntervals?: [number, number][]; // e.g. slide transitions
};
export const DEFAULT_CONFIG: Config = { targetMin: 120, targetMax: 160, longPauseSeconds: 2 };

const SIMPLE_FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm']);
// "like" is only counted when it does not look like a verb/comparison use (conservative heuristic).
const LIKE_PREV_BLOCK = new Set(['would', 'feel', 'feels', 'felt', 'look', 'looks', 'looked', 'seem', 'seems',
  'sound', 'sounds', 'something', 'anything', 'more', 'just', 'much', 'i', 'you', 'they', 'people', 'did', 'do', 'to']);
const LIKE_NEXT_BLOCK = new Set(['to', 'a', 'an', 'the', 'this', 'that', 'my', 'your', 'our', 'it', 'him', 'her', 'them', 'us', 'me']);

const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '');

export type Result = {
  wordsSpoken: number; wpm: number | null; overallWpm: number | null;
  paceLabel: 'slow' | 'comfortable' | 'fast' | 'no_speech';
  speechSeconds: number; elapsedSeconds: number;
  fillerCounts: Record<string, number>; fillerTotal: number;
  fillerInstances: { filler: string; at: number }[];
  longPauseCount: number; longPauseSeconds: number;
  longPauseSegments: { start: number; end: number; duration: number }[];
  accuracyNote: string;
};

export function analyze(words: Word[], elapsedSeconds: number, cfg: Config = DEFAULT_CONFIG): Result {
  const empty: Result = { wordsSpoken: 0, wpm: null, overallWpm: null, paceLabel: 'no_speech', speechSeconds: 0,
    elapsedSeconds, fillerCounts: {}, fillerTotal: 0, fillerInstances: [], longPauseCount: 0, longPauseSeconds: 0,
    longPauseSegments: [], accuracyNote: 'No speech was detected in this recording.' };
  const w = words.filter(x => norm(x.word) && x.end >= x.start).sort((a, b) => a.start - b.start);
  if (w.length === 0) return empty;

  // Long pauses: gaps between consecutive words above threshold, minus intentional exclusions.
  const segs: Result['longPauseSegments'] = [];
  for (let i = 1; i < w.length; i++) {
    const start = w[i - 1].end, end = w[i].start, d = end - start;
    if (d <= cfg.longPauseSeconds) continue;
    if (cfg.excludeIntervals?.some(([a, b]) => start < b && end > a)) continue;
    segs.push({ start, end, duration: +d.toFixed(2) });
  }
  const pauseSecs = segs.reduce((s, p) => s + p.duration, 0);
  const span = w[w.length - 1].end - w[0].start;
  const speechSeconds = Math.max(span - pauseSecs, 0.001);

  const counts: Record<string, number> = {}; const inst: Result['fillerInstances'] = [];
  const add = (k: string, at: number) => { counts[k] = (counts[k] ?? 0) + 1; inst.push({ filler: k, at }); };
  for (let i = 0; i < w.length; i++) {
    const t = norm(w[i].word), prev = i > 0 ? norm(w[i - 1].word) : '', next = i + 1 < w.length ? norm(w[i + 1].word) : '';
    if (SIMPLE_FILLERS.has(t)) add(t.replace(/(.)\1+$/, '$1'), w[i].start);
    else if (t === 'you' && next === 'know') { add('you know', w[i].start); i++; }
    else if (t === 'like' && !LIKE_PREV_BLOCK.has(prev) && !LIKE_NEXT_BLOCK.has(next)) add('like', w[i].start);
  }
  const fillerTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const real = w.filter(x => !SIMPLE_FILLERS.has(norm(x.word))).length; // pure hesitation sounds aren't content words
  const wpm = real / (speechSeconds / 60);
  const overall = elapsedSeconds > 0 ? real / (elapsedSeconds / 60) : null;
  const paceLabel = wpm < cfg.targetMin ? 'slow' : wpm > cfg.targetMax ? 'fast' : 'comfortable';

  return { wordsSpoken: real, wpm: +wpm.toFixed(1), overallWpm: overall === null ? null : +overall.toFixed(1), paceLabel,
    speechSeconds: +speechSeconds.toFixed(2), elapsedSeconds, fillerCounts: counts, fillerTotal, fillerInstances: inst,
    longPauseCount: segs.length, longPauseSeconds: +pauseSecs.toFixed(2), longPauseSegments: segs,
    accuracyNote: 'WPM = words / speech-active minutes (long pauses removed). Overall WPM = words / total elapsed minutes. ' +
      '"like" is flagged heuristically and may be imperfect. Pace labels are coaching cues relative to your target range.' };
}
