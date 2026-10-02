// AI opponent personalities (original characters). `pers` feeds the evaluators: greed = material weight,
// aggro = pressure on the enemy king / captures, defence = king shelter, chaos = random flair (weak / playful).
export const CHARACTERS = [
  { id: 'bit', zh: '阿仔', en: 'BIT', title: ['見習駭客', 'ROOKIE HACKER'], glyph: '仔', color: 0x7cff6b, pers: { greed: 1, aggro: 0, defence: 0, chaos: 0.6 }, jitter: 60,
    lines: { start: [['請多多指教！', 'Go easy on me!'], ['我啱啱學識行棋咋…', 'I just learned the moves…']], capture: [['咦？食到喎！', 'Whoa, I got one!']], captured: [['哎呀！', 'Ouch!'], ['唔好啊～', 'Noooo~']], check: [['將軍…係咪咁講？', 'Check… is that right?']], win: [['我…贏咗？！', 'I… won?!']], lose: [['下次再嚟！', 'Rematch next time!']] } },
  { id: 'cat', zh: '霓虹貓', en: 'NEON CAT', title: ['亂咁嚟', 'CHAOS PAWS'], glyph: '貓', color: 0xff9ad8, pers: { greed: 0.95, aggro: 0.6, defence: 0, chaos: 1 }, jitter: 45,
    lines: { start: [['喵～玩下啫！', 'Meow~ just playing!']], capture: [['抓到你！', 'Caught you!'], ['喵哈哈！', 'Mya-ha-ha!']], captured: [['嘶——！', 'Hssss!']], check: [['爪爪將軍！', 'Paw check!']], win: [['喵～冇得頂！', 'Purr-fect win~']], lose: [['算你啦…喵。', 'Fine… meow.']] } },
  { id: 'wall', zh: '鐵壁', en: 'IRONWALL', title: ['堅守型', 'THE DEFENDER'], glyph: '壁', color: 0x6fa8ff, pers: { greed: 1.05, aggro: 0, defence: 1.6, chaos: 0.1 }, jitter: 12,
    lines: { start: [['你攻唔入嚟嘅。', 'You will not break through.']], capture: [['反擊成功。', 'Counter-strike.']], captured: [['只係皮外傷。', 'Just a scratch.']], check: [['守得好，就贏得到。', 'Defence wins.']], win: [['防線完好。', 'The wall holds.']], lose: [['…裂開咗。', '…cracked.']] } },
  { id: 'razor', zh: '狂刃', en: 'RAZOR', title: ['猛攻型', 'ALL-IN STRIKER'], glyph: '刃', color: 0xff3b5c, pers: { greed: 0.95, aggro: 1.6, defence: 0, chaos: 0.15 }, jitter: 14,
    lines: { start: [['開波就斬！', 'I strike first!']], capture: [['斬！', 'SLASH!'], ['再嚟！', 'Again!']], captured: [['嘖！', 'Tch!']], check: [['跪低！', 'Kneel!']], win: [['太慢喇。', 'Too slow.']], lose: [['…有料。', '…not bad.']] } },
  { id: 'ghost', zh: '數據幽靈', en: 'DATA GHOST', title: ['計算型', 'THE CALCULATOR'], glyph: '靈', color: 0x9ffcff, pers: { greed: 1, aggro: 0.4, defence: 0.6, chaos: 0 }, jitter: 6,
    lines: { start: [['已計算 10⁹ 種可能。', '10⁹ lines computed.']], capture: [['符合預測。', 'As predicted.']], captured: [['誤差範圍內。', 'Within tolerance.']], check: [['將軍。機率 97%。', 'Check. 97% certain.']], win: [['結果已鎖定。', 'Outcome locked.']], lose: [['…重新校準中。', '…recalibrating.']] } },
  { id: 'dragon', zh: '金龍', en: 'GOLD DRAGON', title: ['貪食型', 'THE HOARDER'], glyph: '龍', color: 0xffd23c, pers: { greed: 1.35, aggro: 0.5, defence: 0.3, chaos: 0.05 }, jitter: 8,
    lines: { start: [['你啲棋子，全部係我嘅。', 'Your pieces are my treasure.']], capture: [['收藏＋1！', 'Into the hoard!']], captured: [['我嘅寶物！', 'My treasure!']], check: [['龍息將軍！', 'Dragon-breath check!']], win: [['寶庫又滿咗。', 'The hoard grows.']], lose: [['…龍都會跌。', '…even dragons fall.']] } },
  { id: 'granny', zh: '黑客婆婆', en: 'GRANNY HEX', title: ['老江湖', 'OLD-SCHOOL TRICKSTER'], glyph: '婆', color: 0xc58cff, pers: { greed: 1, aggro: 0.9, defence: 0.9, chaos: 0 }, jitter: 4,
    lines: { start: [['後生仔，坐低飲杯茶先。', 'Sit down, have some tea, kid.']], capture: [['呢招我六十年前已經識。', 'Learned that trick 60 years ago.']], captured: [['哦？有啲意思。', 'Oh? Interesting.']], check: [['小心你隻帥呀。', 'Mind your king, dear.']], win: [['返去再練下啦。', 'Go practise some more.']], lose: [['好！婆婆服你。', 'Well played, kid.']] } },
  { id: 'zero', zh: '零式', en: 'ZERO', title: ['塔頂守護者', 'TOWER GUARDIAN'], glyph: '零', color: 0xffffff, boss: true, pers: { greed: 1.05, aggro: 0.8, defence: 0.8, chaos: 0 }, jitter: 0,
    lines: { start: [['挑戰者，證明你自己。', 'Challenger. Prove yourself.']], capture: [['刪除。', 'Deleted.']], captured: [['…有趣。', '…interesting.']], check: [['終局臨近。', 'The end approaches.']], win: [['塔，屬於我。', 'The tower is mine.']], lose: [['你…超越咗零。', 'You… surpassed ZERO.']] } },
];
export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
export const PLAYER_COLOR = 0x00e5ff;
