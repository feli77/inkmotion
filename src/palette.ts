// Keep the deletion clock tied to the ring animation, including interrupted holds.
export function bindPaletteHold(container: HTMLElement, removeColor: (color: string) => void): () => void {
  let press: {
    button: HTMLButtonElement;
    delay: number;
    pointerId?: number;
    key?: string;
    progress?: Animation;
  } | undefined;
  let suppressClick = false;
  const swatch = (target: EventTarget | null) => (target as Element | null)?.closest<HTMLButtonElement>('.swatch:not([data-color="transparent"])');

  function release(cancelled = false): void {
    const active = press;
    if (!active) return;
    press = undefined;
    clearTimeout(active.delay);
    const { button, progress, pointerId } = active;
    button.classList.remove('is-pressed');
    if (!cancelled) button.classList.add('is-rebounding');
    if (pointerId !== undefined && button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    if (cancelled || progress) suppressClick = true;
    if (progress) {
      const ring = button.querySelector<SVGCircleElement>('.swatch-progress')!;
      const offset = getComputedStyle(ring).strokeDashoffset;
      progress.onfinish = null;
      progress.cancel();
      const rollback = ring.animate([{ strokeDashoffset: offset }, { strokeDashoffset: '1' }], {
        duration: 260, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'forwards',
      });
      rollback.onfinish = () => {
        button.classList.remove('is-deleting');
        rollback.cancel();
      };
    } else if (active.key && !cancelled) button.click();
  }

  function start(button: HTMLButtonElement, pointerId?: number, key?: string): void {
    if (press) return;
    button.classList.remove('is-rebounding');
    button.classList.add('is-pressed');
    const active = { button, pointerId, key, delay: 0, progress: undefined as Animation | undefined };
    press = active;
    active.delay = window.setTimeout(() => {
      if (press !== active || !button.isConnected) return;
      suppressClick = true;
      button.classList.add('is-deleting');
      active.progress = button.querySelector('.swatch-progress')!.animate([
        { strokeDashoffset: '1' }, { strokeDashoffset: '0' },
      ], { duration: 1000, easing: 'linear', fill: 'forwards' });
      active.progress.onfinish = () => {
        if (press !== active || !button.isConnected) return;
        press = undefined;
        button.classList.remove('is-pressed');
        active.progress?.cancel();
        removeColor(button.dataset.color!);
      };
    }, 350);
    if (pointerId !== undefined) button.setPointerCapture(pointerId);
  }

  // A completed hold may remove its target before the pointer's click is dispatched.
  document.addEventListener('pointerdown', () => { suppressClick = false; }, true);
  document.addEventListener('click', event => {
    if (suppressClick && event.detail > 0) {
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  container.addEventListener('pointerdown', event => {
    const button = swatch(event.target);
    if (button && event.button === 0 && event.isPrimary) start(button, event.pointerId);
  });
  container.addEventListener('pointermove', event => {
    if (!press || press.pointerId !== event.pointerId) return;
    const bounds = press.button.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) release(true);
  });
  container.addEventListener('pointerup', event => {
    if (press?.pointerId === event.pointerId) release();
  });
  for (const eventName of ['pointercancel', 'lostpointercapture'] as const) {
    container.addEventListener(eventName, event => {
      if (press?.pointerId === event.pointerId) release(true);
    });
  }
  container.addEventListener('keydown', event => {
    const button = swatch(event.target);
    if (!button || (event.key !== ' ' && event.key !== 'Enter')) return;
    event.preventDefault();
    if (!event.repeat) start(button, undefined, event.key);
  });
  container.addEventListener('keyup', event => {
    if (press?.key !== event.key) return;
    event.preventDefault();
    release();
  });
  container.addEventListener('focusout', event => {
    if (press?.key && press.button === event.target) release(true);
  });
  container.addEventListener('contextmenu', event => {
    if (swatch(event.target)) event.preventDefault();
  });
  container.addEventListener('animationend', event => {
    if (event.animationName === 'swatch-rebound') swatch(event.target)?.classList.remove('is-rebounding');
  });
  window.addEventListener('blur', () => release(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(true); });
  return () => release(true);
}
