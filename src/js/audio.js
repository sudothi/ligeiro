/* Sound effects (synthesised, no files) and the voice that reads the number aloud. */
(function () {
  let ctx = null;
  const opts = { sound: true, voice: true };

  function tone(freq, dur = 0.12, type = 'triangle', vol = 0.16, when = 0) {
    if (!opts.sound) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) { /* audio not available */ }
  }

  const sfx = {
    click: () => tone(660, 0.06, 'sine', 0.08),
    appear: () => { tone(523, 0.1); tone(784, 0.14, 'triangle', 0.14, 0.07); },
    correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.15, i * 0.08)),
    skip: () => { tone(392, 0.12, 'sine', 0.1); tone(330, 0.16, 'sine', 0.1, 0.1); },
    finish: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.15, i * 0.12))
  };

  let ptVoice = null;
  function pickVoice() {
    try {
      const vs = speechSynthesis.getVoices();
      ptVoice = vs.find(v => /pt[-_]BR/i.test(v.lang)) || vs.find(v => /^pt/i.test(v.lang)) || null;
    } catch (e) { ptVoice = null; }
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function say(text, rate = 0.85) {
    if (!opts.voice || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = 'pt-BR';
      u.rate = rate;
      u.pitch = 1.1;
      if (ptVoice) u.voice = ptVoice;
      speechSynthesis.speak(u);
    } catch (e) { /* speech not available */ }
  }
  function hush() { try { speechSynthesis.cancel(); } catch (e) {} }

  window.Audio2 = { sfx, say, hush, opts };
})();
