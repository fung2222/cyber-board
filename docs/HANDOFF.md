# CYBER BOARD 賽博棋鬥 — Handoff

Repo `fung2222/cyber-board` · live https://fung2222.github.io/cyber-board/ · demo `?demo=1` · noindex everywhere (index + privacy).
Part of the CYBER arcade programme (rules: `cyber-arcade/docs/ARCADE-HANDOFF.md`): written from scratch (no code from
fung2222/sono), original names only (**Flip** instead of the reversi trademark, **Sky Race** instead of the ludo trademark),
zh-HK first + English, endless mode, ads only at natural breaks, Three.js r169 + cyber-kit, no build step.

## 1. Design summary
* **One app, four games**: Chess 國際象棋, Xiangqi 中國象棋, Flip 黑白棋, Sky Race 飛行棋. Start screen = 4 cards → mode screen
  (rules blurb, ENDLESS TOWER button, vs-AI difficulty 1–5 + opponent character, sky players/humans/planes, VS AI / LOCAL 2P).
* **Signature feature: capture battles** (`js/battle.js`). Every capture plays a 1–2.5 s cinematic, skippable by tap/Space/Esc/back.
  Settings → 吃子對決動畫 CAPTURE BATTLES: **FULL / QUICK / OFF** (`cyber.cyber-board.fx`).
  *Auto-quick* (`battleMode()` in `js/main.js`): in endless/demo a recapture within 2 plies is quick; cheap pawn captures in a busy
  stretch are quick; AI-vs-AI dogfights are quick; >4 full battles within 14 s → quick. Flip uses full FX only for 6+ flips.
* **Endless tower per game** (`js/tower.js`, deterministic `floorSpec(game, floor)`):
  * strength `strengthOf(f) = 1 − 0.95·e^(−(f−1)/9)` (≈0.05 at F1, ≈0.97 at F30, never exceeds 1) → search depth/time/jitter/blunder.
  * chess/xiangqi floors: **RUSH** (capture N pieces within M moves), **ENDGAME** (procedural, validated winning-side endgame:
    mate within M moves), **DUEL**. Every 5th floor = boss duel (Razor/Granny/Gold Dragon/Data Ghost) + checkpoint; every 10th =
    ZERO 零式 + milestone.
  * flip floors: random symmetric **void cells** (blocked), objectives DUEL / MARGIN (win by ≥ N) / CORNERS (own ≥ 2 corners and win).
  * sky floors: players 2→3→4 and planes 2→3→4 as floors rise; RACE or HUNTER (shoot down N planes).
  * Saved per game in `cyber.cyber-board.tower.<game>` = `{floor, best, checkpoint}`. Loss → back to checkpoint (floor after last
    cleared boss); rewarded **revive** retries the same floor once (free on web). Chips (`chips`) reward = `floorChips(f)`.
  * Skins (player piece colour) unlock at best floor 5/10/20/30/40 (any game); ZERO becomes a selectable vs-AI opponent after F10.
* **AI characters** (`js/characters.js`): 阿仔 BIT, 霓虹貓 NEON CAT, 鐵壁 IRONWALL, 狂刃 RAZOR, 數據幽靈 DATA GHOST, 金龍 GOLD DRAGON,
  黑客婆婆 GRANNY HEX, 零式 ZERO (boss). `pers` = {greed, aggro, defence, chaos} feeds the evaluators; bilingual taunt lines for
  start/capture/captured/check/win/lose shown in a speech bubble. Player emotes (好嘢/冇難度/大鑊/GG) make the AI answer.
* Extras: check alert (king ring + shockwave + SFX + AI taunt), checkmate drama (slow-mo, glitch, king shatters, red pillar,
  banner), promotion picker (♛♜♝♞), last-move tiles, legal-move dots / capture rings (toggle 提示落點), hint (green), undo,
  local 2P with auto table rotation for chess/xiangqi (toggle 雙人時轉棋盤), piece idle bob, selected lift.

## 2. Rules (all in `js/rules/`, pure JS, no DOM — node-testable)
* **chess.js** — 10×12 mailbox, double 32-bit Zobrist. Castling (incl. through-check), en passant (incl. pinned-ep), promotion with
  choice (`play({from,to,promo})`, default queen), check/checkmate/stalemate, draws by threefold repetition, 50-move (100 plies),
  insufficient material (K vs K, K+minor vs K, bishops all on one colour). `undo()` replays from `startFen`.
* **xiangqi.js** — index `r*9+f`, rank 0 = red's back rank. Palace, river (elephants can't cross, soldiers move sideways after
  crossing), flying general (generals may not face each other on an open file — also used as an attack), cannon screen capture,
  horse leg block, elephant eye block. **No legal move = loss** (checkmate or stalemate). Draws: threefold repetition,
  120 plies without capture (60 moves each), neither side has attacking material. *Not implemented:* the Asian perpetual-check /
  chase rulings (treated as repetition draw) — documented simplification.
* **flip.js** — 8×8, side 1 moves first, outflank ≥1 line, all lines flip, forced pass, game ends when neither side can move,
  disc count decides. Optional `VOID` cells (value 2) for endless.
* **skyrace.js** — simplified 飛行棋 (rules shown in-game):
  2–4 colours (2 players = opposite corners), 2 or 4 planes; shared 52-square loop, colour c starts at square 13c;
  progress `rel` −1 hangar · 0..50 loop · 51..55 home lane · 56 home. Roll **6 to launch** (onto rel 0); a 6 gives another roll;
  three 6s in a row forfeit the turn. **Exact roll** to finish. **Boost**: landing on a loop square of your colour (`abs%4==colour`)
  jumps +4 (once, only if it stays ≤ rel 50). **Capture**: landing on enemy planes sends them to their hangar, except on the four
  start squares (**safe**); checked at the landing square and again after a boost. First colour with all planes home wins.

## 3. AI
* `js/ai/search.js` — negamax alpha-beta, iterative deepening, quiescence (captures), TT, MVV-LVA + killers + history ordering,
  LMR, check extension, repetition = draw score, time limit, plus **jitter** (random eval noise) and **blunder** chance for weak
  levels and character flavour. Evaluators `evalchess.js` / `evalxq.js` (material + PST formulas + king safety / aggression
  scaled by `pers`). From the start position it reaches depth ~8 (chess) / ~7 (xiangqi) in ~1 s.
* `js/ai/flipai.js` — negamax alpha-beta with positional weights (corners, X/C squares), mobility, corner control and an exact endgame solve.
* `js/ai/skyai.js` — heuristic: capture > home > launch > boost > safety/danger, `chaos` adds randomness.
* `js/ai/worker.js` (module Web Worker) + `js/ai/client.js` (`think(job)`, falls back to main thread if workers fail).
* Strength mapping: `DIFF_STRENGTH = [_, .05, .3, .55, .78, 1]`; `aiOptions(game, s, char)` → depth `1+round(s·7)` (chess) /
  `1+round(s·6)` (xiangqi/flip), time 220–1520 ms, jitter ∝ (1−s)², blunder `max(0, .22−.5s)`.

## 4. Capture battles — catalogue & game-feel notes
| Piece | Move (zh / en) | Script |
|---|---|---|
| Chess pawn / Xiangqi soldier 兵卒 | 旋風刃 SPIN BLADE | dash beside the victim, 3 spinning slashes, white 360° burst finisher |
| Knight / Horse 馬 | 流星踏 METEOR STOMP / 躍馬踏 LEAPING STOMP | leap to 2.3 m, flip at apex, meteor slam, double shockwave |
| Bishop 象 | 稜光貫 PRISM LANCE | stand-off, charge, light-lance pierce through, beam explosion |
| Rook / Chariot 車 | 攻城衝 SIEGE RAM / 鐵騎衝 CHARIOT RAM | rev back, charge with trail, double impact |
| Queen 后 | 霓虹風暴 NEON TEMPEST | blink-combo from five angles + overhead strike (multi-hit combo counter) |
| King / General 帥將 | 王者震 ROYAL QUAKE / 帥令震 COMMAND SLAM | rise with aura, heavy slam, triple quake rings |
| Cannon 炮 | 電漿砲 PLASMA MORTAR | recoil, plasma orb lobbed over the screen piece, explosion |
| Advisor 仕士 | 雙針刺 TWIN NEEDLES | two crossing thrusts → X burst |
| Elephant 相象 | 象踏 TUSK TRAMPLE | two heavy hops, quake on each landing |
| Sky Race jet | 空戰 DOGFIGHT | climb, loop behind, three laser bolts, explosion → victim respawns in its hangar |
| Flip | chain lightning | each line flips outward link by link (lightning arc + rising pentatonic tick), 4+ = CHAIN popup, corner = pillar + triple shockwave + chord |

Beat structure (from game-feel practice — Vlambeer "juice", Jan Willem Nijman's *The Art of Screenshake*, Sakurai on hit-stop,
Squirrel Eiserloh's *trauma²* shake): **anticipation** 0.3–0.4 s (squash, charge particles, riser SFX, camera swoop + letterbox +
name card) → **action** (stretch + trail dash) → **contact frames** where flash, sparks, shake, SFX, haptic and **hit-stop
45–100 ms** fire on the *same* frame → **finisher** (160 ms hit-stop, white flash, shards, shockwave, board ripple, 0.42 s slow-mo,
K.O. / n-HIT COMBO text, move name) → **follow-through** (attacker lands on the square with a squash bounce, camera eases back).
Camera framing is solved from the real FOV each battle: portrait = over-the-shoulder, landscape = side-on profile.
QUICK mode = 0.6 s strike without camera move. Everything runs on game time so pause / hit-stop freeze it.

## 5. File map
```
index.html            screens (start/mode/settings/pause/result/promo), HUD, importmap → vendor/cyber-kit (v0.2.1)
css/game.css          HUD + screens on top of cyber-kit/ui/hud.css; letterbox / battle card; body.battling hides HUD
js/main.js            app shell: stage, NeonCity, board, camera rig (fitCamera solves distance + view offset for HUD margins),
                      menus, settings, endless tower + results + rewards, rewarded undo/hint/revive, demo, window.__board hook
js/i18n.js            re-exports cyber-kit i18n + tOther() + [data-i18n-alt] (other-language subtitles)
js/strings.js         every zh-HK / English string
js/boards.js          Board: Reflector surface + canvas-drawn neon layouts (chess/xiangqi/flip/sky), slab, pylons, ripple,
                      cellPos/cellAt, markers; Sky Race layout tables (SKY_PATH/LANE/HOME/HANGAR)
js/pieces.js          Piece (lathe chess pieces / xiangqi glyph discs, holo shell shader), Disc, Jet, HoloDie
js/holo.js            shared shaders/materials/geometry helpers, glyph textures, easing
js/fx3d.js            shards, slashes, beams, orbs, lightning, ghosts, pillars, flash light
js/battle.js          MOVES catalogue + BattleDirector (timeline scripts, camera, hit-stop, slow-mo, card)
js/audio.js           BoardAudio extends kit SynthAudio: all SFX synthesised (Web Audio), 'chill' music
js/characters.js      AI personalities + bilingual lines
js/tower.js           floorSpec / strength / aiOptions / procedural endgames
js/games/gridgame.js  chess + xiangqi controller
js/games/flipgame.js  flip controller
js/games/skygame.js   sky race controller
js/rules/*.js         rules engines (see §2)            js/ai/*.js   AI (see §3)
tests/rules.test.mjs  node unit tests (82)             tests/smoke.py  headless Chrome smoke test → docs/shots/
privacy.html          bilingual privacy policy (noindex)
```
Controller interface (all three): `start(cfg)`, `tap(worldPoint)`, `update(dt,t,frozen)`, `dispose()`, `canUndo()/undo()`, `hint()`,
`humanTurn()`, `refreshHud()`, `busy`, `over`. `cfg = {game, mode:'ai'|'local'|'endless'|'demo'|'preview', strength, charId, diff,
spec (endless floor), players, planes, humans}`. Controllers talk to the shell only through the `app` object in `main.js`.

## 6. Tests
* `node tests/rules.test.mjs` → **82/82**. Chess perft start 20 / 400 / 8 902 / 197 281, Kiwipete 48 / 2 039 / 97 862,
  pos3 14 / 191 / 2 812 / 43 238, pos4 6 / 264 / 9 467, pos5 44 / 1 486 / 62 379. Xiangqi perft start **44 / 1 920 / 79 666**
  (depth 4 = 3 290 240 also verified during development). Edge cases: castling rights/through-check, ep + pinned ep, promotion
  choice, mates/stalemate, repetition, 50-move, insufficient material, flying general, cannon screen, horse leg, elephant eye,
  palace, river, stalemate = loss, Flip pass/end/count, Sky Race launch/exact finish/boost/capture/safe/three-sixes, AI finds
  back-rank mate (chess) and a two-rook mate (xiangqi), tower floors valid for F1–60.
* `python -m http.server <port>` then `/workspace/.venv-pw/bin/python tests/smoke.py <port> [outdir]` — 412×915 touch + 1280×800:
  menus, mode screen, local chess with pawn/queen/bishop capture battles (mid-battle screenshots), fool's mate → checkmate →
  result, language switch, xiangqi cannon-over-screen + chariot recapture battles, flip chain, sky race forced dogfight +
  return-to-hangar, endless floor with real pointer taps and an AI reply from the worker, QUICK/OFF modes, demo autoplay;
  fails on any console error. SwiftShader runs at 2–4 FPS so it takes ~8–10 min. It writes PNGs; the committed
  `docs/shots/*.jpg` are the same shots converted to JPEG (q84) to keep the repo small.

## 7. Storage keys (`cyber.cyber-board.*`) & flags
`fx` full|quick|off · `hints` · `rotate` · `haptics` · `music` · `muted` · `skin` · `diff` · `char` · `skyPlayers` · `skyPlanes` ·
`chips` · `tower.chess|xiangqi|flip|sky`. Language = shared `cyber.lang`. Flags: `?demo=1&game=…`, `?lang=`, `?fps=1`,
`?quality=low` (no Reflector), `?adsim=1`, `?reset=1`.

## 8. Ads (via `createAds`, web build shows none)
* Interstitial: only `naturalBreak('match')` when leaving a result screen (Next / Rematch / Menu), capped by the kit
  (150 s grace, 180 s cooldown, every 3rd break).
* Rewarded (opt-in, confirm dialog on native, granted free on web): **revive** after a failed endless floor (retry the same
  floor instead of the checkpoint, once), **undo** and **hint** in endless after the free one per floor. Casual / 2P = free.

## 9. cyber-kit
Built against **cyber-kit v0.2.1** (tag exists; v0.2.0 + patch: i18n + endless helpers), vendored via `git archive v0.2.1`
(README/docs/examples/tests stripped). The game's `js/i18n.js` re-exports the kit i18n and only adds `tOther` + `[data-i18n-alt]`.
`endlessCurve` is not used because the tower has its own deterministic `strengthOf` with the same saturating shape.

## 10. Known issues / ideas
* Xiangqi long-check / long-chase rulings are simplified to the repetition draw.
* Sky Race has no undo (dice); hint highlights the AI's preferred plane.
* Performance: the board Reflector renders the scene a second time at half resolution; `?quality=low` disables it. Auto
  pixel-ratio downgrade from the kit is active during play.
* Ideas: online/async multiplayer, daily puzzle floor, more skins (piece shapes), per-character music stingers, Android packaging
  (`/android/` ignored; follow the arcade Capacitor recipe), Play Games achievements for tower milestones.
