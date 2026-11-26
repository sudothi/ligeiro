/* Sound effects (synthesised, no files) and the recorded voice clips (praise only).
   The numbers are not spoken, and the system voice (Windows/Android TTS) is never used:
   it sounded like a different person. */
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

  /* Recorded voice clips (src/audio/<key>.mp3), played in sequence at the recorded
     speed (recorded slowly on purpose). A missing clip is simply skipped. */
  const VOICE_RATE = 1;
  const clipCache = {};
  const clipOk = {};
  let playing = null;
  let token = 0;

  function loadClip(key) {
    if (!clipCache[key]) {
      clipCache[key] = new Promise(resolve => {
        const a = new Audio(`audio/${key}.mp3`);
        a.preload = 'auto';
        a.oncanplaythrough = () => { clipOk[key] = true; resolve(a); };
        a.onerror = () => { clipOk[key] = false; resolve(null); };
        a.load();
      });
    }
    return clipCache[key];
  }

  async function speak(clips) {
    if (!opts.voice) return;
    const my = ++token;
    hush();
    const audios = await Promise.all(clips.map(loadClip));
    if (my !== token) return;
    for (const a of audios) {
      if (!a) continue;
      if (my !== token) return;
      playing = a;
      a.currentTime = 0;
      a.preservesPitch = true;
      a.playbackRate = VOICE_RATE;
      await new Promise(res => { a.onended = res; a.onpause = res; a.play().catch(res); });
    }
    playing = null;
  }

  function preload(keys) { keys.forEach(loadClip); }

  function hush() {
    if (playing) { try { playing.pause(); } catch (e) {} playing = null; }
  }
  function stop() { token++; hush(); }

  window.Audio2 = { sfx, speak, preload, hush: stop, opts };
})();
