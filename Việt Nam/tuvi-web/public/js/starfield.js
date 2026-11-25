/**
 * Lớp ánh sáng nền tinh tế kiểu Apple Ambient Material.
 * Tôn trọng tuyệt đối `prefers-reduced-motion` và giữ không gian đọc lá số tĩnh lặng.
 */
export function initStarfield(canvasId = 'starfield-canvas') {
  const el = document.getElementById(canvasId);
  if (!(el instanceof HTMLCanvasElement)) return;
  const canvas = el;
  const rawCtx = canvas.getContext('2d');
  if (!rawCtx) return;
  const ctx = rawCtx;

  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

  function isDarkActive() {
    const explicit = document.documentElement.dataset.theme;
    if (explicit === 'dark') return true;
    if (explicit === 'light') return false;
    return Boolean(darkQuery?.matches);
  }

  function renderAmbient() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Paint a single whisper-soft Apple atmospheric radial glow — zero busy particle clutter.
    const dark = isDarkActive();
    const cx = width * 0.5;
    const cy = height * 0.14;
    const radius = Math.max(width, height) * 0.65;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    if (dark) {
      grad.addColorStop(0, 'rgba(10, 132, 255, 0.10)');
      grad.addColorStop(0.5, 'rgba(94, 92, 230, 0.04)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      grad.addColorStop(0, 'rgba(0, 113, 227, 0.055)');
      grad.addColorStop(0.55, 'rgba(175, 82, 222, 0.02)');
      grad.addColorStop(1, 'rgba(245, 245, 247, 0)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  renderAmbient();
  window.addEventListener('resize', renderAmbient, { passive: true });
  darkQuery?.addEventListener?.('change', renderAmbient);
  motionQuery?.addEventListener?.('change', renderAmbient);

  // Re-render when manual theme attribute changes
  const observer = new MutationObserver(renderAmbient);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
