/* Finger logic for the webcam mode, without any camera or drawing code.
   Numbering (child's point of view): left pinky 1, left ring 2, left middle 3,
   left index 4, left thumb 5, right thumb 6, right index 7, right middle 8,
   right ring 9, right pinky 10 (10 shows as 0 in the game and on the paper rings).
   Gesture: hands open and flat on the table, the child bends one finger. */

// MediaPipe hand landmarks
export const WRIST = 0;
export const FINGERS = [ // f = 0 thumb … 4 pinky
  { name: 'polegar', joints: [1, 2, 3, 4] },
  { name: 'indicador', joints: [5, 6, 7, 8] },
  { name: 'médio', joints: [9, 10, 11, 12] },
  { name: 'anelar', joints: [13, 14, 15, 16] },
  { name: 'mindinho', joints: [17, 18, 19, 20] }
];
export const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
];

export const fingerNumber = (side, f) => side === 'L' ? 5 - f : 6 + f;
export const numberToFinger = n => n <= 5 ? { side: 'L', f: 5 - n } : { side: 'R', f: n - 6 };
export const fingerLabel = n => {
  const { side, f } = numberToFinger(n);
  return `${FINGERS[f].name} ${side === 'L' ? 'esquerdo' : 'direito'}`;
};
/* the game's digit for each finger (10 → 0) */
export const digitOf = n => n % 10;

const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* Landmarks come normalised (0..1). Put them in screen space: aspect, then the view
   options (mirror, rotate 180°). Everything else works on these points. */
export function toView(lm, w, h, { mirror = false, rotate = false } = {}) {
  return lm.map(p => {
    let x = p.x, y = p.y;
    if (mirror) x = 1 - x;
    if (rotate) { x = 1 - x; y = 1 - y; }
    return { x: x * w, y: y * h, z: p.z };
  });
}

/* Which of the child's hands is this, from its shape (palm down, seen from above):
   for the left hand the pinky is on the left of the line wrist → middle finger.
   Rotating the image does not change this; mirroring it does. */
export function chirality(p) {
  const v1x = p[9].x - p[0].x, v1y = p[9].y - p[0].y;
  const v2x = p[17].x - p[5].x, v2y = p[17].y - p[5].y;
  const cross = v1x * v2y - v1y * v2x;
  return cross < 0 ? 'L' : 'R';
}

/* Give each detected hand a side. Shape first; when both hands look the same
   (a hand turned over, or a bad frame), fall back to left/right on the screen. */
export function assignSides(hands) {
  if (hands.length === 0) return [];
  if (hands.length === 1) return [{ pts: hands[0], side: chirality(hands[0]), how: 'forma' }];
  const two = hands.slice(0, 2);
  const c = two.map(chirality);
  if (c[0] !== c[1]) return two.map((pts, i) => ({ pts, side: c[i], how: 'forma' }));
  const cx = pts => (pts[5].x + pts[9].x + pts[13].x + pts[17].x) / 4;
  const leftFirst = cx(two[0]) <= cx(two[1]);
  return two.map((pts, i) => ({ pts, side: (i === 0) === leftFirst ? 'L' : 'R', how: 'posição' }));
}

/* Does the screen show the hands upside down (fingers pointing down)? Used for a hint. */
export function fingersPointDown(hands) {
  if (!hands.length) return false;
  let s = 0;
  for (const p of hands) s += p[9].y - p[0].y;
  return s > 0;
}

/* How long each finger looks, relative to the size of the hand.
   Bending a finger brings its tip closer to its base, so this number drops.
   The thumb bends across the palm, so its tip is measured to the pinky's base. */
export function extensions(p) {
  const palm = (d(p[0], p[9]) + d(p[5], p[17])) / 2 || 1;
  return FINGERS.map((fg, f) => {
    const [base, , , tip] = fg.joints;
    return f === 0 ? d(p[4], p[17]) / palm : d(p[base], p[tip]) / palm;
  });
}

/* Per-finger memory of what "at rest" (open, flat) looks like, and a 0..1 bend score.
   rest[n] is learned by calibration and keeps adapting slowly: an open finger is
   the longest it gets, so the rest value follows the maximum and decays very slowly. */
export class BendMeter {
  constructor() { this.reset(); }
  reset() {
    this.rest = {};   // n → rest extension
    this.smooth = {}; // n → smoothed extension
    this.calib = null;
    this.done = false; // true after a calibration with the hands at rest
  }
  get calibrated() { return this.done && !this.calib; }
  startCalibration() { this.calib = {}; }
  finishCalibration() {
    if (!this.calib) return 0;
    let count = 0;
    for (const [n, vals] of Object.entries(this.calib)) {
      if (vals.length < 5) continue;
      vals.sort((a, b) => a - b);
      this.rest[n] = vals[Math.floor(vals.length * 0.6)];
      count++;
    }
    this.calib = null;
    if (count) this.done = true;
    return count;
  }
  /* sides: output of assignSides. Returns { n: score } for the fingers it can see. */
  /* FULL = how much shorter a fully bent finger looks; the thumb moves less seen from above */
  update(sides, FULL = 0.35, FULL_THUMB = 0.25) {
    const scores = {};
    for (const { pts, side } of sides) {
      const ext = extensions(pts);
      for (let f = 0; f < 5; f++) {
        const n = fingerNumber(side, f);
        const s = this.smooth[n] == null ? ext[f] : this.smooth[n] * 0.5 + ext[f] * 0.5;
        this.smooth[n] = s;
        if (this.calib) { (this.calib[n] = this.calib[n] || []).push(s); continue; }
        const r = this.rest[n] == null ? s : Math.max(s, this.rest[n] * 0.9995);
        this.rest[n] = r;
        scores[n] = Math.max(0, Math.min(1, (r - s) / r / (f === 0 ? FULL_THUMB : FULL)));
      }
    }
    return scores;
  }
}

/* Turns the scores into "finger n was bent" events: one finger clearly ahead of the
   others, for holdMs in a row. Then it waits until that finger opens again. */
export class FingerPicker {
  constructor(opts = {}) {
    this.threshold = opts.threshold ?? 0.5;
    this.margin = opts.margin ?? 0.15;
    this.holdMs = opts.holdMs ?? 300;
    this.cand = null; this.since = 0; this.locked = null; this.lostAt = 0;
  }
  /* returns the finger number on the frame it is picked, otherwise null */
  update(scores, now) {
    const ns = Object.keys(scores).map(Number);
    if (this.locked != null) {
      const s = scores[this.locked];
      if (s == null) {
        if (!this.lostAt) this.lostAt = now;
        if (now - this.lostAt > 600) this.locked = null;
      } else {
        this.lostAt = 0;
        if (s < this.threshold * 0.6) this.locked = null;
      }
      return null;
    }
    let top = null, second = 0;
    for (const n of ns) {
      if (top == null || scores[n] > scores[top]) { if (top != null) second = Math.max(second, scores[top]); top = n; }
      else second = Math.max(second, scores[n]);
    }
    const ok = top != null && scores[top] >= this.threshold && scores[top] - second >= this.margin;
    if (!ok) { this.cand = null; return null; }
    if (this.cand !== top) { this.cand = top; this.since = now; return null; }
    if (now - this.since < this.holdMs) return null;
    this.locked = top; this.cand = null;
    return top;
  }
  /* the finger currently being held (for drawing), or null */
  get active() { return this.locked; }
}
