// Main-thread AI client: posts jobs to the module Web Worker; falls back to running in-thread if workers are unavailable.
let worker = null, seq = 0; const pending = new Map();
function ensure() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.res); };
    worker.onerror = (e) => { e.preventDefault && e.preventDefault(); worker = false; for (const [, p] of pending) p.fallback(); pending.clear(); };
  } catch { worker = false; }
  return worker;
}
async function local(job) {
  const { search, makePosition } = await import('./search.js');
  const { flipSearch } = await import('./flipai.js');
  const opts = { ...job.opts, timeMs: Math.min(job.opts.timeMs ?? 500, 500) };
  return job.game === 'flip' ? flipSearch(job.board, job.side, opts) : search(makePosition(job.game, job.fen, job.hist), { ...opts, game: job.game });
}
/** job: { game: 'chess'|'xiangqi'|'flip', fen?, hist?, board?, side?, opts } → Promise<{move, score, depth}> */
export function think(job) {
  const w = ensure();
  if (!w) return local(job);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, fallback: () => local(job).then(resolve, reject) });
    w.postMessage({ id, ...job, board: job.board ? Array.from(job.board) : undefined });
  });
}
export function cancelAll() { for (const [, p] of pending) p.resolve(null); pending.clear(); if (worker) { worker.terminate(); worker = null; } }
