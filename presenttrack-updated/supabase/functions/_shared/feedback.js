// Feedback: rule-based fallback + sanitizer for model output. Pure.
const LIM = { summary: 600, item: 240, maxItems: 5 };

export function cleanText(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function validateFeedback(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const list = (v) => (Array.isArray(v) ? v : [])
    .filter((x) => typeof x === 'string')
    .map((x) => cleanText(x, LIM.item)).filter(Boolean).slice(0, LIM.maxItems);
  if (typeof obj.summary !== 'string') return null;
  const out = {
    summary: cleanText(obj.summary, LIM.summary),
    strengths: list(obj.strengths),
    improvements: list(obj.improvements),
    recommendations: list(obj.recommendations),
  };
  if (!out.summary) return null;
  if (!out.strengths.length && !out.improvements.length && !out.recommendations.length) return null;
  return out;
}

// `result` is the object returned by classify().
export function ruleBasedFeedback(metrics, result) {
  const m = metrics || {};
  const dims = (result && result.dims) || {};
  const pts = (k) => (dims[k] ? dims[k].points : 0);
  const strengths = [];
  const improvements = [];
  const recommendations = [];

  if (pts('pace') === 2) strengths.push('Your speaking pace was in a comfortable range for listeners.');
  else if ((m.wpm || 0) < 130) { improvements.push('Your pace was on the slower side; a little more energy could help keep listeners engaged.'); recommendations.push('Practice reading a paragraph aloud at a slightly quicker, steady pace.'); }
  else { improvements.push('Your pace was on the faster side; slowing down can make key points easier to follow.'); recommendations.push('Mark key phrases in your notes and pause briefly after each one.'); }

  if (pts('fillers') === 2) strengths.push('Few possible filler words were detected.');
  else { improvements.push('Possible filler words (such as "um" or "uh") showed up fairly often. Automatic detection is imperfect, so this is an estimate.'); recommendations.push('Replace a filler with a calm, short silent pause while you think.'); }

  if (pts('pauses') === 2) strengths.push('Your delivery flowed without many long pauses.');
  else { improvements.push('There were several long pauses (2 seconds or more).'); recommendations.push('Rehearse your transitions between slides so the next point comes to mind quickly.'); }

  const ds = result && result.durationAssessment && result.durationAssessment.status;
  if (ds === 'within_range') strengths.push('Your talk length was within the 2-3 minute target.');
  else if (ds === 'too_short') { improvements.push('Your recording was shorter than the 2-3 minute target.'); recommendations.push('Add one more detail or example to each main point.'); }
  else if (ds === 'too_long') { improvements.push('Your recording was longer than the 2-3 minute target.'); recommendations.push('Trim each point to its most important sentence.'); }

  if (!strengths.length) strengths.push('You completed a full baseline recording, which is a great starting point.');
  recommendations.push('Record again in a few weeks and compare your results to track progress.');

  const label = { proficient: 'a strong baseline', developing: 'a developing baseline', needs_improvement: 'a baseline with room to grow' }[result && result.classification] || 'a baseline';
  return {
    summary: `This recording shows ${label}. It reflects pace, possible filler words, long pauses and length only, so treat it as a starting point rather than a final judgment.`,
    strengths: strengths.slice(0, LIM.maxItems),
    improvements: improvements.slice(0, LIM.maxItems),
    recommendations: recommendations.slice(0, LIM.maxItems),
  };
}
