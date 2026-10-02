// AI Web Worker: runs chess / xiangqi alpha-beta and FLIP search off the main thread.
import { search, makePosition } from './search.js';
import { flipSearch } from './flipai.js';
self.onmessage = (e) => {
  const { id, game, fen, hist, board, side, opts } = e.data;
  try {
    let res;
    if (game === 'flip') res = flipSearch(board, side, opts);
    else res = search(makePosition(game, fen, hist), { ...opts, game });
    self.postMessage({ id, res });
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
