/* Small canvas confetti burst for correct answers and the end of a round. */
(function () {
  const cv = document.getElementById('confetti');
  const cx = cv.getContext('2d');
  const colors = ['#ffc93c', '#2bc46b', '#3ba4ff', '#ff6b6b', '#ffffff', '#e84393'];
  let parts = [];
  let raf = 0;

  function resize() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
  addEventListener('resize', resize);
  resize();

  function burst(n = 80, x = innerWidth / 2, y = innerHeight / 2) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 6 + Math.random() * 10;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, r: 5 + Math.random() * 6,
        c: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 1 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    const d = devicePixelRatio;
    cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.012;
      cx.save();
      cx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      cx.translate(p.x * d, p.y * d);
      cx.rotate(p.rot);
      cx.fillStyle = p.c;
      cx.fillRect(-p.r * d / 2, -p.r * d / 4, p.r * d, p.r * d / 2);
      cx.restore();
    }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
  }

  window.Confetti = { burst };
})();
