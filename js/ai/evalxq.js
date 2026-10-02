// Xiangqi evaluation (red-positive). Formula-built positional terms, written from scratch.
import { fileOf, rankOf, K, A, B, N, R, C, P } from '../rules/xiangqi.js';
const MAT = [0, 0, 120, 120, 280, 620, 290, 40];
export function evalXiangqi(pos, pers = {}) {
  const b = pos.b; const greed = pers.greed ?? 1, aggro = pers.aggro ?? 0, defence = pers.defence ?? 0;
  let mat = 0, ps = 0, guards = [0, 0], attackers = [0, 0];
  const rk = pos.kings[1], bk = pos.kings[-1];
  for (let s = 0; s < 90; s++) {
    const p = b[s]; if (!p) continue;
    const t = Math.abs(p), red = p > 0, f = fileOf(s), r = rankOf(s);
    const adv = red ? r : 9 - r;                 // 0 own back rank .. 9 enemy back rank
    const cf = 4 - Math.abs(f - 4);              // 0 edge .. 4 centre file
    let v = 0;
    if (t === P) { v = adv >= 5 ? 40 + (adv - 5) * 18 + cf * 6 - (adv === 9 ? 30 : 0) : adv * 4; }
    else if (t === N) { v = cf * 6 + Math.min(adv, 7) * 5 - (f === 0 || f === 8 ? 10 : 0); }
    else if (t === R) { v = Math.min(adv, 7) * 3 + (f === 3 || f === 5 ? 6 : 0); }
    else if (t === C) { v = (f === 4 ? 14 : cf * 2) + (adv <= 3 ? 6 : 0); }
    else if (t === A || t === B) { if (red) guards[0]++; else guards[1]++; }
    if (t === R || t === N || t === C || (t === P && adv >= 5)) {
      if (red) attackers[0]++; else attackers[1]++;
      if (aggro) { const ek = red ? bk : rk; if (ek >= 0) { const d = Math.abs(fileOf(ek) - f) + Math.abs(rankOf(ek) - r); v += Math.max(0, 9 - d) * 3 * aggro; } }
    }
    if (red) { mat += MAT[t]; ps += v; } else { mat -= MAT[t]; ps -= v; }
  }
  // defenders matter more when the enemy keeps attackers
  ps += (guards[0] * attackers[1] - guards[1] * attackers[0]) * (4 + 4 * defence);
  return Math.round(mat * greed + ps);
}
