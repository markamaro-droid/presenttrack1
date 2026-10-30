// Single source of truth for every threshold used by the Initial Presentation Assessment.
// Pure ES module: no Deno/Node globals. Change numbers here only.

function deepFreeze(o) {
  Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(o);
}

export const CRITERIA = deepFreeze({
  version: 1,
  // Recording length (seconds)
  duration: {
    targetMinSec: 120, targetMaxSec: 180,        // 2:00-3:00 = full points
    acceptableMinSec: 90, acceptableMaxSec: 210, // 1:30-3:30 = partial points
    submitMinSec: 20, submitMaxSec: 900,         // accepted by the upload endpoint
    maxAudioBytes: 10 * 1024 * 1024,
  },
  // Pace in words per minute (speaking time only, see metrics.js)
  pace: { idealMin: 130, idealMax: 160, acceptableMin: 110, acceptableMax: 180 },
  // Pauses
  pauses: {
    longPauseSec: 2.0,   // a gap >= this between two words is a "long pause"
    perMinuteGood: 2,    // <= good
    perMinuteOk: 5,      // <= ok, above = needs work
  },
  // Fillers
  fillers: {
    perMinuteGood: 3,    // <= good
    perMinuteOk: 6,      // <= ok, above = needs work
    single: ['um', 'umm', 'uhm', 'uh', 'uhh', 'er', 'erm', 'ano'],
    phrases: [['you', 'know']],
    ambiguous: ['like'], // counted only when the heuristic in metrics.js says so
    likeBlockedPrev: [
      'i', 'we', 'they', 'you', 'he', 'she', 'it', 'would', 'dont', "don't", 'didnt', "didn't",
      'doesnt', "doesn't", 'do', 'did', 'look', 'looks', 'looked', 'feel', 'feels', 'felt',
      'just', 'something', 'anything', 'nothing', 'someone', 'seems', 'sounds', 'love', 'loves', 'enjoy',
    ],
    likeBlockedNext: ['to'],
    youKnowBlockedPrev: ['do', 'did', 'if', 'as', 'dont', "don't", 'didnt', "didn't"],
  },
  // Recognition quality gates
  quality: {
    minWords: 40,              // fewer recognized words => unusable
    minSpeechCoverage: 0.25,   // speaking time / recorded time below this => unusable
    noSpeechProb: 0.6,         // a segment above this is "probably silence"
    noSpeechSegmentShare: 0.5, // share of such segments that makes the recording unusable
    lowConfidence: 0.5,        // mean exp(avg_logprob) below this => low
  },
  // Scoring (each dimension 0..2) and classification cutoffs
  scoring: {
    points: { good: 2, ok: 1, poor: 0 },
    dimensions: ['pace', 'fillers', 'pauses', 'duration'],
    maxPoints: 8,
    proficientMin: 7,   // and no dimension at 0
    developingMin: 4,
  },
});
