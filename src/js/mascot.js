/* Dedé, the game's mascot: a little hand-shaped creature (palm body, four finger
   "tufts" on top and a thumb it waves with). Flat shapes, no outlines.
   Moods: happy (idle), cheer (correct), think (waiting), oops (skipped). */
(function () {
  const C = {
    body: '#FFB23F', shade: '#F39A1E', belly: '#FFD27A',
    eye: '#FFFFFF', pupil: '#2A1F4F', cheek: '#FF7E8E', mouth: '#7A2140', tongue: '#FF6F7F'
  };

  const svg = `
<svg class="dede" viewBox="0 0 240 270" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse class="d-shadow" cx="120" cy="256" rx="62" ry="9" fill="rgba(20,10,60,.18)"/>
  <g class="d-all">
    <g class="d-feet" fill="${C.shade}">
      <ellipse cx="92" cy="236" rx="20" ry="12"/>
      <ellipse cx="148" cy="236" rx="20" ry="12"/>
    </g>
    <g class="d-arm-l"><rect x="18" y="140" width="40" height="22" rx="11" fill="${C.shade}" transform="rotate(25 50 150)"/></g>
    <g class="d-fingers" fill="${C.body}">
      <rect class="f1" x="48"  y="66" width="34" height="80" rx="17"/>
      <rect class="f2" x="84"  y="40" width="34" height="100" rx="17"/>
      <rect class="f3" x="120" y="34" width="34" height="100" rx="17"/>
      <rect class="f4" x="156" y="52" width="34" height="90" rx="17"/>
    </g>
    <rect x="42" y="96" width="156" height="142" rx="64" fill="${C.body}"/>
    <ellipse cx="120" cy="196" rx="48" ry="30" fill="${C.belly}" opacity=".7"/>
    <g class="d-thumb"><rect x="186" y="104" width="34" height="70" rx="17" fill="${C.body}" transform="rotate(28 200 170)"/></g>
    <g class="d-face">
      <g class="d-eyes-open">
        <circle cx="96" cy="140" r="21" fill="${C.eye}"/>
        <circle cx="146" cy="140" r="21" fill="${C.eye}"/>
        <g class="d-pupils" fill="${C.pupil}">
          <circle cx="99" cy="143" r="12"/><circle cx="149" cy="143" r="12"/>
          <circle cx="103" cy="138" r="4" fill="#fff"/><circle cx="153" cy="138" r="4" fill="#fff"/>
        </g>
      </g>
      <g class="d-eyes-happy" fill="none" stroke="${C.pupil}" stroke-width="7" stroke-linecap="round">
        <path d="M82 144 Q96 126 110 144"/><path d="M132 144 Q146 126 160 144"/>
      </g>
      <ellipse cx="74" cy="168" rx="11" ry="7" fill="${C.cheek}" opacity=".8"/>
      <ellipse cx="168" cy="168" rx="11" ry="7" fill="${C.cheek}" opacity=".8"/>
      <path class="d-mouth-smile" d="M108 170 Q121 184 134 170" fill="none" stroke="${C.mouth}" stroke-width="6" stroke-linecap="round"/>
      <g class="d-mouth-open">
        <path d="M104 166 Q121 166 138 166 Q136 196 121 196 Q106 196 104 166Z" fill="${C.mouth}"/>
        <ellipse cx="121" cy="188" rx="10" ry="6" fill="${C.tongue}"/>
      </g>
      <path class="d-mouth-o" d="M114 176 a7 8 0 1 0 14 0 a7 8 0 1 0 -14 0" fill="${C.mouth}"/>
    </g>
  </g>
</svg>`;

  function mount(el) {
    el.innerHTML = svg;
    const root = el.querySelector('.dede');
    let timer = null;
    const api = {
      set(mood, ms) {
        root.dataset.mood = mood;
        clearTimeout(timer);
        if (ms) timer = setTimeout(() => (root.dataset.mood = 'happy'), ms);
      }
    };
    api.set('happy');
    return api;
  }

  window.Mascot = { mount };
})();
