// Test helper: build word arrays from compact specs.
export function seq(tokens, { start = 0, wordDur = 0.3, gap = 0.1 } = {}) {
  let t = start;
  return tokens.map((w) => { const o = { word: w, start: t, end: t + wordDur }; t += wordDur + gap; return o; });
}
export function plain(n, opts) { return seq(Array.from({ length: n }, (_, i) => 'word' + i), opts); }
