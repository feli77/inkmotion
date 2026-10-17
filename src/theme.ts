const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const transitionDuration = 900;
let activeTransition: ViewTransition | undefined;
let activeAnimations: Animation[] = [];
let activeMask: SVGSVGElement | undefined;

function createBrushMask(width: number, height: number): SVGSVGElement {
  const radius = Math.max(width, height) * 0.2;
  const passes = Math.ceil((width + height) / (Math.SQRT2 * radius * 1.6));
  const points = [{ x: -radius, y: -radius }];
  for (let pass = 0; pass <= passes; pass++) {
    const diagonal = (width + height) * pass / passes;
    const ends = [
      { x: Math.max(0, diagonal - height), y: Math.min(height, diagonal) },
      { x: Math.min(width, diagonal), y: Math.max(0, diagonal - width) },
    ];
    if (pass % 2 === 0) ends.reverse();
    for (const point of ends) {
      const previous = points[points.length - 1];
      if (point.x !== previous.x || point.y !== previous.y) points.push(point);
    }
  }
  points.push({ x: width + radius, y: height + radius });
  const path = points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('theme-brush-mask');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs>
    <mask id="theme-brush-mask" maskUnits="userSpaceOnUse" mask-type="luminance" x="0" y="0" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="white" />
      <path d="${path}" pathLength="1" fill="none" stroke="black" stroke-width="${radius * 2}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1" stroke-dashoffset="1" />
    </mask>
  </defs>`;
  return svg;
}

function finishTransition(): void {
  activeTransition?.skipTransition();
  for (const animation of activeAnimations) animation.cancel();
  activeMask?.remove();
  activeTransition = undefined;
  activeAnimations = [];
  activeMask = undefined;
  document.documentElement.classList.remove('theme-transition', 'theme-transition-live');
}

export function animateThemeChange(update: () => void): void {
  finishTransition();
  if (reducedMotion.matches || typeof document.startViewTransition !== 'function'
    || !CSS.supports('mask-image', 'url("#theme-brush-mask")')) {
    update();
    return;
  }

  const started = performance.now();
  const root = document.documentElement;
  const mask = createBrushMask(window.innerWidth, window.innerHeight);
  document.body.append(mask);
  activeMask = mask;
  root.classList.add('theme-transition');
  const transition = document.startViewTransition(() => {
    // Capture only the old view, leaving the new DOM available for real clicks.
    if (activeTransition === transition) root.classList.add('theme-transition-live');
    update();
  });
  activeTransition = transition;
  void transition.ready.then(() => {
    if (activeTransition !== transition) return;
    const duration = transitionDuration - (performance.now() - started);
    if (duration <= 0) {
      finishTransition();
      return;
    }
    const timing = {
      duration,
      easing: 'linear',
      fill: 'both',
    } as const;
    // Keep the old snapshot alive while the SVG stroke erases it cumulatively.
    activeAnimations = [root.animate({ opacity: [1, 1] }, {
      ...timing, pseudoElement: '::view-transition-old(root)',
    })];
    activeAnimations.push(mask.querySelector('path')!.animate({ strokeDashoffset: ['1', '0'] }, timing));
  }).catch(() => {
    // Skipped snapshots (for example, in a background tab) still apply the theme.
    if (activeTransition === transition) finishTransition();
  });
  void transition.finished.finally(() => {
    if (activeTransition === transition) finishTransition();
  }).catch(() => { /* A skipped transition must not interrupt the editor. */ });
}

window.addEventListener('resize', finishTransition);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) finishTransition();
});
