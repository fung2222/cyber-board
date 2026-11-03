// Shared CYBER ARCADE start/launch transition: two glowing rings + Loading...
// Self-contained: injects its own styles and DOM, auto-binds common start controls.
// Importing this module is enough for a game; hub can call showGameLoading() directly.

const STYLE = `
#ck-game-loading{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%,rgba(5,1,15,.78) 0%,rgba(5,1,15,.92) 55%,rgba(5,1,15,.97) 100%);backdrop-filter:blur(14px) saturate(.72);-webkit-backdrop-filter:blur(14px) saturate(.72);opacity:1;pointer-events:auto;transition:opacity .32s ease}
#ck-game-loading.hidden{display:none!important}
#ck-game-loading.out{opacity:0}
#ck-game-loading .ck-gl-core{position:relative;width:178px;height:178px;display:grid;place-items:center}
#ck-game-loading .ck-gl-ring{position:absolute;border-radius:50%;border:1px solid color-mix(in srgb,var(--c1,#00e5ff) 78%,transparent);box-shadow:0 0 18px color-mix(in srgb,var(--c1,#00e5ff) 70%,transparent),inset 0 0 18px color-mix(in srgb,var(--c1,#00e5ff) 20%,transparent)}
#ck-game-loading .ck-gl-a{inset:0;border-top-color:transparent;border-right-color:transparent;animation:ckGlSpin 1.35s linear infinite}
#ck-game-loading .ck-gl-b{inset:17px;border-color:color-mix(in srgb,var(--c2,#ff2bd6) 76%,transparent);border-bottom-color:transparent;border-left-color:transparent;box-shadow:0 0 16px color-mix(in srgb,var(--c2,#ff2bd6) 65%,transparent),inset 0 0 14px color-mix(in srgb,var(--c2,#ff2bd6) 18%,transparent);animation:ckGlSpin 1.9s linear infinite reverse}
#ck-game-loading .ck-gl-text{position:relative;z-index:1;font-family:'Orbitron',var(--font-zh,sans-serif);font-size:13px;font-weight:700;letter-spacing:3px;color:#fff;text-shadow:0 0 8px var(--c1,#00e5ff),0 0 22px var(--c2,#ff2bd6)}
@keyframes ckGlSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){#ck-game-loading .ck-gl-ring{animation:none}}
`;
const DEFAULT_START_SELECTORS = [
  '#btn-start', '#btn-play', '#btn-stage-go', '#btn-vsai', '#btn-local', '#btn-fight',
  '.mode-card', '.stage-card', '[data-map]',
];
const activeSelectors = new Set();

let root = null, active = false, injected = false, bound = false;

function ensureRoot() {
  if (typeof document === 'undefined') return null;
  if (!injected) {
    const s = document.createElement('style');
    s.id = 'ck-game-loading-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
    injected = true;
  }
  if (!root) {
    root = document.getElementById('ck-game-loading');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ck-game-loading';
      root.className = 'hidden';
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.innerHTML = '<div class="ck-gl-core"><span class="ck-gl-ring ck-gl-a"></span><span class="ck-gl-ring ck-gl-b"></span><span class="ck-gl-text">Loading...</span></div>';
      document.body.appendChild(root);
    }
  }
  return root;
}

/** Show the shared transition. Resolves after it has faded out. */
export function showGameLoading({ label = 'Loading...', hold = 900, fade = 320 } = {}) {
  if (active) return Promise.resolve();
  const el = ensureRoot();
  if (!el) return Promise.resolve();
  active = true;
  el.querySelector('.ck-gl-text').textContent = label;
  el.classList.remove('hidden', 'out');
  el.setAttribute('aria-hidden', 'false');
  void el.offsetWidth;
  return new Promise((resolve) => {
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('out');
        el.setAttribute('aria-hidden', 'true');
        active = false;
        resolve();
      }, Math.max(0, fade));
    }, Math.max(0, hold));
  });
}

/** Bind start controls to the shared transition without touching their handlers. */
export function bindStartLoading(selectors = DEFAULT_START_SELECTORS) {
  if (typeof document === 'undefined') return;
  for (const s of selectors) activeSelectors.add(s);
  if (bound) return;
  bound = true;
  document.addEventListener('click', (ev) => {
    const query = [...activeSelectors].join(',');
    const el = ev.target?.closest?.(query);
    if (!el || el.disabled || el.classList.contains('locked') || el.getAttribute('aria-disabled') === 'true') return;
    showGameLoading();
  }, true);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bindStartLoading(), { once: true });
  else bindStartLoading();
}
