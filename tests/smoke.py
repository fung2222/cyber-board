"""CYBER BOARD smoke test — headless Chrome (SwiftShader WebGL) at 412x915 (mobile/touch) and 1280x800.
Plays moves in all four games, triggers capture battles (screenshots mid-battle), checkmate + result screen,
both languages, endless floor start, demo autoplay. Fails on any console error / page error.

    python -m http.server <port>   # from the repo root, any free port
    /workspace/.venv-pw/bin/python tests/smoke.py <port> [outdir]
"""
import sys, time, os
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else '8000'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'docs', 'shots')
os.makedirs(OUT, exist_ok=True)
BASE = f'http://127.0.0.1:{PORT}/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
fails = []

def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)

def idle(pg, t=40):
    t0 = time.time()
    while time.time() - t0 < t:
        if not pg.evaluate('__board.busy || __board.battle'): return True
        time.sleep(0.1)
    return False

def battle_shots(pg, name, at=(0.75,), timeout=40):
    """wait for the running capture battle and screenshot it at the given battle times (s)"""
    t0 = time.time(); k = 0; seen = False
    while time.time() - t0 < timeout:
        bt = pg.evaluate('__board.battleT()')
        if bt >= 0: seen = True
        if k < len(at) and bt >= at[k]:
            pg.screenshot(path=f'{OUT}/{name}_{k}.png' if len(at) > 1 else f'{OUT}/{name}.png'); k += 1
        if seen and bt < 0: break
        time.sleep(0.04)
    return seen

def mv(pg, a, b, promo=None):
    pg.evaluate(f"(() => {{ __board.move({{from:{a}, to:{b}{', promo:' + str(promo) if promo else ''}}}); return 0; }})()")

def run(p, tag, vw, vh, mobile):
    print(f'== {tag} {vw}x{vh}')
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx = b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=1, has_touch=mobile, is_mobile=mobile)
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(BASE + '?lang=zh'); pg.wait_for_function('window.__board', timeout=30000); time.sleep(2.5)
    pg.screenshot(path=f'{OUT}/{tag}_01_start_zh.png')
    check(pg.evaluate('__board.state') == 'menu', 'start screen')
    # mode screen
    pg.click('.gcard[data-game="xiangqi"]'); time.sleep(1.2)
    pg.screenshot(path=f'{OUT}/{tag}_02_mode_xiangqi_zh.png')
    check(pg.evaluate('__board.state') == 'mode', 'mode screen')
    # ---- CHESS (local) : pawn spin, queen tempest, bishop lance
    pg.evaluate('__board.local("chess")'); time.sleep(1.5)
    pg.screenshot(path=f'{OUT}/{tag}_03_chess_board.png')
    mv(pg, 85, 65); idle(pg); mv(pg, 34, 54); idle(pg)       # e4 d5
    mv(pg, 65, 54); check(battle_shots(pg, f'{tag}_04_battle_pawn_spin', (0.35, 0.9, 1.15)), 'chess pawn capture battle'); idle(pg)
    mv(pg, 24, 54); check(battle_shots(pg, f'{tag}_05_battle_queen_tempest', (1.0,)), 'chess queen capture battle'); idle(pg)   # Qxd5
    mv(pg, 92, 73); idle(pg)                                     # Nc3
    mv(pg, 54, 87); check(battle_shots(pg, f'{tag}_06_battle_queen2', (0.6,)), 'queen takes g2'); idle(pg)   # Qxg2
    mv(pg, 96, 87); check(battle_shots(pg, f'{tag}_07_battle_bishop_lance', (0.8,)), 'chess bishop capture battle'); idle(pg)  # Bxg2
    check(pg.evaluate('__board.fen()').startswith('rnb1kbnr/ppp1pppp/8/8/8/2N5/PPPP1PBP/R1BQK1NR b'), 'chess position after captures: ' + pg.evaluate('__board.fen()'))
    pg.screenshot(path=f'{OUT}/{tag}_08_chess_after.png')
    # ---- CHESS fool's mate -> checkmate drama + result screen
    pg.evaluate('__board.local("chess")'); time.sleep(1)
    for a, c in [(86, 76), (35, 55), (87, 67)]: mv(pg, a, c); idle(pg)
    mv(pg, 24, 68); time.sleep(1.2); pg.screenshot(path=f'{OUT}/{tag}_09_checkmate.png')
    t0 = time.time()
    while pg.evaluate('__board.state') != 'result' and time.time() - t0 < 30: time.sleep(0.2)
    time.sleep(0.8); pg.screenshot(path=f'{OUT}/{tag}_10_result_zh.png')
    check(pg.evaluate('__board.state') == 'result', 'checkmate -> result screen')
    # ---- language toggle -> English
    pg.evaluate('__board.lang("en")'); time.sleep(0.4)
    check(pg.evaluate('document.documentElement.lang') == 'en', 'language switched to en')
    pg.evaluate('__board.menu()'); time.sleep(1.2); pg.screenshot(path=f'{OUT}/{tag}_11_start_en.png')
    # ---- XIANGQI (local): cannon mortar over the screen, chariot ram recapture
    pg.evaluate('__board.local("xiangqi")'); time.sleep(1.5)
    pg.screenshot(path=f'{OUT}/{tag}_12_xiangqi_board.png')
    mv(pg, 25, 88); check(battle_shots(pg, f'{tag}_13_battle_cannon_mortar', (0.5, 1.0)), 'xiangqi cannon screen capture battle'); idle(pg)
    mv(pg, 89, 88); check(battle_shots(pg, f'{tag}_14_battle_chariot_ram', (0.85,)), 'xiangqi chariot recapture battle'); idle(pg)
    check(pg.evaluate('__board.fen()').split(' ')[0] == 'rnbakabr1/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C7/9/RNBAKABNR', 'xiangqi position: ' + pg.evaluate('__board.fen()'))
    # ---- FLIP (local): a few moves, chain lightning
    pg.evaluate('__board.local("flip")'); time.sleep(1.2)
    for i in range(6):
        pg.evaluate('(() => { const c = __board.ctrl; const m = c.pos.moves(); let best = m[0], n = -1; for (const x of m) { const f = c.pos.flipsFor(x).length; if (f > n) { n = f; best = x; } } __board.move(best); return 0; })()')
        if i == 5: time.sleep(0.35); pg.screenshot(path=f'{OUT}/{tag}_15_flip_chain.png')
        idle(pg)
    cnt = pg.evaluate('(() => { const c = __board.ctrl.pos.count(); return c[1] + c[-1]; })()')
    check(cnt == 10, f'flip disc count after 6 moves = {cnt}')
    pg.screenshot(path=f'{OUT}/{tag}_16_flip_board.png')
    # ---- SKY RACE (local 2P): forced dogfight
    pg.evaluate('(() => { __board.local("sky"); return 0; })()'); time.sleep(1.5)
    pg.screenshot(path=f'{OUT}/{tag}_17_sky_board.png')
    pg.evaluate('__board.skySetup([[0,0,6],[2,0,35],[0,1,20]])'); time.sleep(0.4)
    pg.evaluate('__board.dice(3)'); pg.evaluate('(() => { __board.roll(); return 0; })()')
    t0 = time.time()
    while not pg.evaluate('__board.ctrl.choices ? 1 : 0') and time.time() - t0 < 20: time.sleep(0.1)
    if pg.evaluate('__board.ctrl.choices ? 1 : 0'):
        pg.evaluate('(() => { __board.move(__board.ctrl.choices.find(m => m.plane === 0)); return 0; })()')
    check(battle_shots(pg, f'{tag}_18_battle_dogfight', (0.7, 1.1)), 'sky race dogfight battle'); idle(pg)
    check(pg.evaluate('__board.ctrl.g.pos[2][0]') == -1, 'captured plane sent back to hangar')
    pg.screenshot(path=f'{OUT}/{tag}_19_sky_after.png')
    pg.evaluate('__board.dice(5)'); pg.evaluate('(() => { __board.roll(); return 0; })()'); time.sleep(1.6); idle(pg)
    # ---- ENDLESS chess floor 1 vs AI: AI replies through the worker
    pg.evaluate('__board.endless("chess")'); time.sleep(1.0)
    pg.screenshot(path=f'{OUT}/{tag}_20_endless_floor1_en.png')
    time.sleep(1.5)
    for sq in (85, 65):    # real pointer taps on e2 then e4 (exercises picking)
        pt = pg.evaluate(f'__board.cellScreen({sq})'); pg.mouse.click(pt['x'], pt['y']); time.sleep(0.6)
    idle(pg)
    check(pg.evaluate('__board.ctrl.pos.moves.length') >= 1 and pg.evaluate('__board.ctrl.pos.moves[0].san') == 'e4', 'tap-to-move e2-e4')
    t0 = time.time()
    while pg.evaluate('__board.ctrl.pos.side') != 1 and time.time() - t0 < 25: time.sleep(0.2)
    idle(pg)
    check(pg.evaluate('__board.ctrl.pos.moves.length') == 2, 'endless AI replied')
    pg.screenshot(path=f'{OUT}/{tag}_21_endless_after_ai.png')
    # ---- quick + off battle modes
    pg.evaluate('__board.setFx("quick")'); pg.evaluate('__board.local("chess")'); time.sleep(0.8)
    for a, c in [(85, 65), (34, 54)]: mv(pg, a, c); idle(pg)
    mv(pg, 65, 54); check(battle_shots(pg, f'{tag}_22_battle_quick', (0.25,)), 'quick battle mode'); idle(pg)
    pg.evaluate('__board.setFx("off")'); mv(pg, 24, 54); idle(pg)
    check(not pg.evaluate('__board.battle'), 'battle off mode')
    pg.evaluate('__board.setFx("full")')
    ctx.close(); b.close()
    real = [e for e in errs if 'favicon' not in e]
    check(not real, f'zero console errors ({len(real)}) ' + ' | '.join(real[:5]))

def demo(p):
    print('== demo autoplay')
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(BASE + '?demo=1&game=xiangqi&lang=en'); pg.wait_for_function('window.__board', timeout=30000)
    t0 = time.time()
    while time.time() - t0 < 60 and pg.evaluate('__board.ctrl.pos.moves.length') < 3: time.sleep(0.5)
    pg.screenshot(path=f'{OUT}/desk_23_demo_xiangqi.png')
    check(pg.evaluate('__board.mode') == 'demo' and pg.evaluate('__board.ctrl.pos.moves.length') >= 2, 'demo autoplay making moves')
    b.close()
    check(not errs, f'demo zero console errors ({len(errs)}) ' + ' | '.join(errs[:3]))

with sync_playwright() as p:
    run(p, 'mob', 412, 915, True)
    run(p, 'desk', 1280, 800, False)
    demo(p)
print('ALL PASSED' if not fails else f'{len(fails)} FAILED: ' + '; '.join(fails))
sys.exit(1 if fails else 0)
