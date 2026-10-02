"""CYBER BOARD camera-control test — headless Chrome, real CDP touch events at 412x915 and mouse/wheel at 1280x800.
Pinch / twist / two-finger drag clamps, tap-vs-gesture separation, taps still move pieces in all four games
(incl. tapping a piece's head), reset-view button, battle save/restore of the view. Fails on any console error.

    python -m http.server <port>   # from the repo root
    /workspace/.venv-pw/bin/python tests/view.py <port> [outdir]
"""
import sys, time, os, math
from playwright.sync_api import sync_playwright

PORT = sys.argv[1] if len(sys.argv) > 1 else '8000'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'docs', 'shots')
os.makedirs(OUT, exist_ok=True)
BASE = f'http://127.0.0.1:{PORT}/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
fails = []
EPS = 1e-6

def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg, flush=True)
    if not cond: fails.append(msg)

def V(pg): return pg.evaluate('__board.view()')

def settle(pg, t=25):
    t0 = time.time()
    while time.time() - t0 < t:
        v = V(pg); a, b = v['target'], v['cur']
        if all(abs(a[k] - b[k]) < 2e-3 for k in a): time.sleep(0.4); return True
        time.sleep(0.15)
    return False

def idle(pg, t=60):
    t0 = time.time()
    while time.time() - t0 < t:
        if not pg.evaluate('__board.busy || __board.battle'): return True
        time.sleep(0.1)
    return False

class Touch:
    def __init__(self, pg):
        self.cdp = pg.context.new_cdp_session(pg)
    def send(self, typ, pts):
        self.cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i, 'radiusX': 6, 'radiusY': 6, 'force': 1} for i, (x, y) in pts]})
    def tap(self, x, y, jitter=0):
        self.send('touchStart', [(0, (x, y))]); time.sleep(0.05)
        if jitter: self.send('touchMove', [(0, (x + jitter, y + jitter * 0.5))]); time.sleep(0.03)
        self.send('touchEnd', []); time.sleep(0.15)
    def drag1(self, x, y, dx, dy, steps=8):
        self.send('touchStart', [(0, (x, y))])
        for k in range(1, steps + 1): self.send('touchMove', [(0, (x + dx * k / steps, y + dy * k / steps))]); time.sleep(0.02)
        self.send('touchEnd', []); time.sleep(0.15)
    def two(self, path, steps=12):
        """path(k) -> ((x1,y1),(x2,y2)) for k in [0,1]"""
        a, b = path(0); self.send('touchStart', [(0, a), (1, b)]); time.sleep(0.03)
        for k in range(1, steps + 1):
            a, b = path(k / steps); self.send('touchMove', [(0, a), (1, b)]); time.sleep(0.02)
        self.send('touchEnd', []); time.sleep(0.1)
    def pinch(self, cx, cy, d0, d1, steps=12):
        self.two(lambda k: ((cx - (d0 + (d1 - d0) * k) / 2, cy), (cx + (d0 + (d1 - d0) * k) / 2, cy)), steps)
    def twist(self, cx, cy, r, a0, a1, steps=12):
        def p(k):
            a = a0 + (a1 - a0) * k
            return ((cx - r * math.cos(a), cy - r * math.sin(a)), (cx + r * math.cos(a), cy + r * math.sin(a)))
        self.two(p, steps)
    def drag2(self, cx, cy, dx, dy, gap=90, steps=12):
        self.two(lambda k: ((cx - gap / 2 + dx * k, cy + dy * k), (cx + gap / 2 + dx * k, cy + dy * k)), steps)

def tap_cell(pg, T, sq, head=False):
    settle(pg)
    p = pg.evaluate(f'__board.pieceTop({sq})' if head else f'__board.cellScreen({sq})')
    T.tap(p['x'], p['y']); time.sleep(0.5)
    return p

def new_page(b, vw, vh, mobile):
    ctx = b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=1, has_touch=mobile, is_mobile=mobile)
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(BASE + '?lang=en'); pg.wait_for_function('window.__board', timeout=30000); time.sleep(2)
    pg.evaluate("localStorage.setItem('cyber.cyber-board.viewTip','1')")
    return pg, errs

def cell_px(pg):
    a, b, c, d = pg.evaluate('[21, 28, 91, 98].map(i => __board.cellScreen(i))')
    return (b['x'] - a['x']) / 7, (d['x'] - c['x']) / 7

def mobile(p):
    print('== mobile 412x915 (CDP touch)', flush=True)
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg, errs = new_page(b, 412, 915, True); T = Touch(pg)
    L = pg.evaluate('__board.view().limits')
    # ---- CHESS vs AI
    pg.evaluate('__board.vsAi("chess", 1)'); time.sleep(3); idle(pg); settle(pg)
    far, near = cell_px(pg)
    print(f'     default framing: far-row square {far:.1f}px, near-row square {near:.1f}px (v1.0 was 35.4 / 40.3)')
    check(far >= 42 and near >= 46, 'portrait auto-framing: squares ≥ 42 px (was 35–40)')
    pg.screenshot(path=f'{OUT}/mob_view_after_default.png')
    check(not pg.evaluate("document.getElementById('btn-view').classList.contains('on')"), 'reset-view button hidden at default view')
    pm = pg.evaluate('__board.pickMatrix()'); print('     tap-target matrix (default):', pm['total'], 'spots, misses', pm['miss'][:8])
    check(not pm['miss'], 'chess default view: every square centre, piece body and piece crown picks its own cell')
    # plain taps (with 8px finger jitter) still move: e2 -> e4
    tap_cell(pg, T, 85); sel = pg.evaluate('__board.ctrl.sel'); T.tap(*[pg.evaluate('__board.cellScreen(65)')[k] for k in ('x', 'y')], jitter=8); time.sleep(0.6)
    print('     sel after e2 tap:', sel, 'stats', V(pg)['stats'], 'moves', pg.evaluate('__board.ctrl.pos.moves.map(m => m.san).join(" ")'))
    check(pg.evaluate('__board.ctrl.pos.moves.length') >= 1 and pg.evaluate('__board.ctrl.pos.moves[0].san') == 'e4', 'touch taps (8 px jitter) move e2-e4')
    idle(pg)
    # one-finger drag: no camera move, no tap
    fen = pg.evaluate('__board.fen()'); taps0 = V(pg)['stats']['taps']
    T.drag1(200, 500, 60, -40); time.sleep(0.3)
    v = V(pg)['target']
    check(V(pg)['stats']['taps'] == taps0 and abs(v['zoom'] - 1) < EPS and abs(v['az']) < EPS and pg.evaluate('__board.fen()') == fen, 'one-finger drag = no tap and no camera move')
    # pinch out (zoom in) toward the board centre
    c = pg.evaluate('__board.screenAt(0,0,0)')
    T.pinch(c['x'], c['y'], 80, 260); settle(pg)
    z1 = V(pg)['target']['zoom']
    check(z1 < 0.6, f'pinch-out zooms in (zoom {z1:.2f})')
    check(V(pg)['stats']['taps'] == taps0 and pg.evaluate('__board.fen()') == fen and pg.evaluate('__board.ctrl.sel') < 0, 'pinch never taps / selects')
    check(pg.evaluate("document.getElementById('btn-view').classList.contains('on')"), 'reset-view button shown after a gesture')
    pg.screenshot(path=f'{OUT}/mob_view_after_zoomed.png')
    for _ in range(3): T.pinch(c['x'], c['y'], 60, 380)
    settle(pg); v = V(pg)
    check(abs(v['target']['zoom'] - L['zoomMin']) < 1e-3, f"zoom clamps at min {L['zoomMin']} (got {v['target']['zoom']:.3f})")
    check(v['camDist'] >= v['dist'] * L['zoomMin'] * 0.97, f"camera distance ≥ clamp ({v['camDist']:.2f} vs {v['dist'] * L['zoomMin']:.2f})")
    zf, zn = cell_px(pg); print(f'     max zoom: squares {zf:.0f}–{zn:.0f}px')
    check(zf >= 90, 'max zoom: squares ≥ 90 px')
    # pinch anchored off-centre pans toward the fingers, pan stays inside the board
    pg.evaluate('__board.resetView(true)'); settle(pg)
    q = pg.evaluate('__board.cellScreen(28)')   # h8 corner
    T.pinch(q['x'], q['y'] + 40, 70, 240); settle(pg); v = V(pg)['target']
    check(v['px'] > 0.3 and v['pz'] < -0.3, f"anchored zoom pans toward the fingers (pan {v['px']:.2f},{v['pz']:.2f})")
    check(abs(v['px']) <= 4.12 + EPS and abs(v['pz']) <= 4.12 + EPS, 'pan clamped to the board')
    # taps still work while zoomed + panned: wait for the AI, play g1 knight by tapping its HEAD, then f3
    idle(pg); pg.evaluate('__board.setView({zoom:0.55, px:1.2, pz:2.0, az:0.3})'); settle(pg)
    n0 = pg.evaluate('__board.ctrl.pos.moves.length')
    hp = tap_cell(pg, T, 97, head=True)
    plane_pick = pg.evaluate(f"__board.pick({hp['x']}, {hp['y']})")
    check(pg.evaluate('__board.ctrl.sel') == 97, f'tap on the knight\'s head selects g1 (zoomed + rotated) pick={plane_pick}')
    tap_cell(pg, T, 76); time.sleep(0.8)
    check(pg.evaluate('__board.ctrl.pos.moves.length') == n0 + 1 and pg.evaluate('__board.ctrl.pos.moves[-1] ? 0 : __board.ctrl.pos.moves[__board.ctrl.pos.moves.length-1].san') == 'Nf3', 'zoomed: tap g1 → f3 plays Nf3')
    idle(pg)
    # twist: clamp ±azMax
    pg.evaluate('__board.resetView(true)'); settle(pg)
    T.twist(206, 480, 70, 0, 0.6); v = V(pg)['target']
    check(v['az'] > 0.4, f"twist rotates (az {math.degrees(v['az']):.0f}°)")
    for _ in range(4): T.twist(206, 480, 70, 0, 1.2)
    settle(pg); v = V(pg)['target']
    check(abs(v['az'] - L['azMax']) < 1e-3, f"azimuth clamps at +{math.degrees(L['azMax']):.0f}° (got {math.degrees(v['az']):.1f}°)")
    pg.screenshot(path=f'{OUT}/mob_view_after_twist.png')
    for _ in range(8): T.twist(206, 480, 70, 0, -1.2)
    settle(pg); v = V(pg)['target']
    check(abs(v['az'] + L['azMax']) < 1e-3, f"azimuth clamps at -{math.degrees(L['azMax']):.0f}°")
    # two-finger vertical drag: tilt clamps
    for _ in range(5): T.drag2(206, 600, 0, -260)
    settle(pg); v = V(pg)
    check(abs(v['absPitch'] - L['pitchMin']) < 2e-3, f"tilt clamps at {math.degrees(L['pitchMin']):.0f}° elevation (got {math.degrees(v['absPitch']):.1f}°)")
    pg.screenshot(path=f'{OUT}/mob_view_after_lowtilt.png')
    pm = pg.evaluate('__board.pickMatrix()'); print('     tap-target matrix (34° low tilt, az -70°):', pm['total'], 'spots, misses', pm['miss'][:8])
    check(len(pm['miss']) <= pm['total'] * 0.03, 'low-tilt rotated view: ≥ 97 % of tap spots pick their own cell')
    for _ in range(6): T.drag2(206, 300, 0, 300)
    settle(pg); v = V(pg)
    check(abs(v['absPitch'] - L['pitchMax']) < 2e-3, f"tilt clamps at {math.degrees(L['pitchMax']):.0f}° (never flips; got {math.degrees(v['absPitch']):.1f}°)")
    pm = pg.evaluate('__board.pickMatrix()'); print('     tap-target matrix (84° top-down, az -70°):', pm['total'], 'spots, misses', pm['miss'][:8])
    check(not pm['miss'], 'top-down rotated view: tap-target matrix clean')
    cy = pg.evaluate('__board.cam()')[0][1]
    check(cy > 0.5, 'camera stays above the board')
    # pinch in: clamps at max distance, pan recentres
    for _ in range(4): T.pinch(206, 480, 360, 60)
    settle(pg); v = V(pg)['target']
    check(abs(v['zoom'] - L['zoomMax']) < 1e-3 and abs(v['px']) < EPS and abs(v['pz']) < EPS, f"zoom clamps at max {L['zoomMax']} and pan recentres")
    # reset button
    pg.click('#btn-view'); settle(pg); v = V(pg)['target']
    check(abs(v['zoom'] - 1) < EPS and abs(v['az']) < EPS and abs(v['el']) < EPS, 'reset-view button restores the default framing')
    check(len(errs) == 0, f'chess: zero console errors {errs[:3]}')
    # ---- battle save / restore (local chess so we can force a capture)
    pg.evaluate('__board.setFx("full"); __board.local("chess")'); time.sleep(2); idle(pg)
    for a_, b_ in ((85, 65), (34, 54)): pg.evaluate(f'__board.move({{from:{a_},to:{b_}}})'); idle(pg)
    pg.evaluate('__board.setView({zoom:0.6, az:-0.5, el:0.1})'); settle(pg)
    saved = V(pg)['target']
    pg.evaluate('(() => { __board.move({from:65,to:54}); return 0; })()')   # don't await the battle
    t0 = time.time()
    while pg.evaluate('__board.battleT()') < 0.6 and time.time() - t0 < 20: time.sleep(0.05)
    camw = pg.evaluate('__board.cam()')[2]
    # gestures are ignored during the cinematic (touch moves are frame-aligned, so keep it short: 2 moves)
    T.send('touchStart', [(0, (166, 480)), (1, (246, 480))]); T.send('touchMove', [(0, (110, 470)), (1, (300, 490))]); T.send('touchMove', [(0, (60, 460)), (1, (350, 500))])
    vb = V(pg)['target']; still = pg.evaluate('__board.battleT()') >= 0
    T.send('touchEnd', [])
    print('     battle still running during the pinch:', still)
    check(camw > 0.9, f'battle cinematic owns the camera (camW {camw:.2f})')
    check(still and all(abs(vb[k] - saved[k]) < 1e-6 for k in saved), 'pinch during a battle does not change the view')
    pg.screenshot(path=f'{OUT}/mob_view_battle_zoomed.png')
    idle(pg); time.sleep(1.5); settle(pg)
    va = V(pg)
    check(all(abs(va['target'][k] - saved[k]) < 1e-6 for k in saved) and va['cur']['zoom'] < 0.62, 'view restored after the battle')
    check(pg.evaluate('__board.cam()')[2] < 0.01, 'battle camera fully released')
    # ---- XIANGQI (local, table rotates): pinch + twist, then tap a legal move
    def play_by_taps(game, label):
        pg.evaluate(f'__board.local("{game}")'); time.sleep(2); idle(pg)
        c = pg.evaluate('__board.screenAt(0,0,0)')
        T.pinch(c['x'], c['y'], 90, 170); T.twist(c['x'], c['y'], 80, 0, 0.35); settle(pg)
        # a legal quiet move whose squares are both on screen in the zoomed view
        m = pg.evaluate('''(() => { const on = (i) => { const p = __board.cellScreen(i); return p.x > 30 && p.x < innerWidth - 30 && p.y > 140 && p.y < innerHeight - 120; };
          const l = __board.ctrl.pos.legal().filter(x => !x.cap && on(x.from) && on(x.to)); const m = l[0]; return m ? {from: m.from, to: m.to} : null; })()''')
        check(m is not None, f'{label}: a legal move is visible in the zoomed view')
        if not m: return
        n0 = pg.evaluate('__board.ctrl.pos.moves ? __board.ctrl.pos.moves.length : (__board.ctrl.pos.hist||[]).length')
        fen0 = pg.evaluate('__board.fen()')
        pm = pg.evaluate('__board.pickMatrix()'); print(f'     {label} tap-target matrix (zoomed + twisted):', pm['total'], 'spots, misses', pm['miss'][:8])
        check(not pm['miss'], f'{label}: tap-target matrix clean')
        tap_cell(pg, T, m['from']); sel = pg.evaluate('__board.ctrl.sel')
        tap_cell(pg, T, m['to']); time.sleep(0.8)
        check(sel == m['from'] and pg.evaluate('__board.fen()') != fen0, f'{label}: zoomed + twisted view, taps play {m["from"]}→{m["to"]}')
        pg.screenshot(path=f'{OUT}/mob_view_after_{game}.png')
        idle(pg)
    play_by_taps('xiangqi', 'xiangqi')
    # ---- FLIP
    pg.evaluate('__board.local("flip")'); time.sleep(2); idle(pg)
    T.pinch(206, 480, 90, 240); settle(pg)
    i = pg.evaluate('__board.ctrl.pos.moves()[0]'); f0 = pg.evaluate('__board.ctrl.pos.side')
    tap_cell(pg, T, i); time.sleep(1.2); idle(pg)
    check(pg.evaluate('__board.ctrl.pos.side') != f0 or pg.evaluate('__board.ctrl.pos.b[%d]' % i) != 0, f'flip: zoomed view, tap plays cell {i}')
    pg.screenshot(path=f'{OUT}/mob_view_after_flip.png')
    # ---- SKY RACE
    pg.evaluate('__board.local("sky")'); time.sleep(2.5); idle(pg)
    T.pinch(206, 480, 90, 130); settle(pg)
    pg.evaluate('__board.dice(6)'); pg.evaluate('__board.roll()')
    t0 = time.time()
    while not pg.evaluate('!!__board.ctrl.choices') and time.time() - t0 < 25: time.sleep(0.2)
    settle(pg)
    jp = pg.evaluate('(() => { const c = __board.ctrl; const vis = (m) => { const p = c.jets[c.g.colour][m.plane].root.position, s = __board.screenAt(p.x, 0.35, p.z); return s.x > 20 && s.x < innerWidth - 20 && s.y > 150 && s.y < innerHeight - 110; }; const m = c.choices.find(vis) || c.choices[0], j = c.jets[c.g.colour][m.plane]; const p = j.root.position; return __board.screenAt(p.x, 0.35, p.z); })()')
    col = pg.evaluate('__board.ctrl.g.colour'); pos0 = pg.evaluate(f'JSON.stringify(__board.ctrl.g.pos["{col}"])' if False else 'JSON.stringify(__board.ctrl.g.pos)')
    T.tap(jp['x'], jp['y']); time.sleep(2); idle(pg)
    check(pg.evaluate('JSON.stringify(__board.ctrl.g.pos)') != pos0, 'sky race: zoomed view, tapping a plane launches it')
    pg.screenshot(path=f'{OUT}/mob_view_after_sky.png')
    check(len(errs) == 0, f'mobile: zero console errors {errs[:3]}')
    b.close()

def desktop(p):
    print('== desktop 1280x800 (mouse + wheel)', flush=True)
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg, errs = new_page(b, 1280, 800, False)
    L = pg.evaluate('__board.view().limits')
    pg.evaluate('__board.vsAi("chess", 1)'); time.sleep(3); idle(pg); settle(pg)
    pg.screenshot(path=f'{OUT}/desk_view_default.png')
    pm = pg.evaluate('__board.pickMatrix()'); print('     tap-target matrix (desktop default):', pm['total'], 'spots, misses', pm['miss'][:8])
    check(not pm['miss'], 'desktop default view: tap-target matrix clean')
    c = pg.evaluate('__board.screenAt(0,0,0)')
    pg.mouse.move(c['x'], c['y']); pg.mouse.wheel(0, -400); time.sleep(0.3); v = V(pg)['target']
    check(v['zoom'] < 0.8, f"wheel up zooms in ({v['zoom']:.2f})")
    for _ in range(6): pg.mouse.wheel(0, -600); time.sleep(0.05)
    check(abs(V(pg)['target']['zoom'] - L['zoomMin']) < 1e-3, 'wheel zoom clamps at min')
    for _ in range(10): pg.mouse.wheel(0, 800); time.sleep(0.05)
    check(abs(V(pg)['target']['zoom'] - L['zoomMax']) < 1e-3, 'wheel zoom clamps at max')
    pg.evaluate('__board.resetView(true)')
    fen = pg.evaluate('__board.fen()'); taps0 = V(pg)['stats']['taps']
    pg.mouse.move(640, 400); pg.mouse.down(button='right')
    for k in range(10): pg.mouse.move(640 + 30 * k, 400 + 6 * k)
    pg.mouse.up(button='right'); v = V(pg)['target']
    check(v['az'] < -0.5 and v['el'] > 0, f"right-drag orbits (az {math.degrees(v['az']):.0f}°, el {math.degrees(v['el']):.0f}°)")
    check(V(pg)['stats']['taps'] == taps0 and pg.evaluate('__board.fen()') == fen, 'right-drag never taps')
    for _ in range(3):
        pg.mouse.move(640, 400); pg.mouse.down(button='right'); pg.mouse.move(1200, 50, steps=8); pg.mouse.up(button='right')
    v = V(pg)
    check(abs(v['target']['az'] + L['azMax']) < 1e-3, 'right-drag azimuth clamps')
    check(abs(v['pitch'] + v['target']['el'] - L['pitchMin']) < 2e-3, 'right-drag tilt clamps (low)')
    pg.evaluate('__board.resetView(true)')
    pg.keyboard.down('Control'); pg.mouse.move(640, 400); pg.mouse.down(); pg.mouse.move(500, 520, steps=8); pg.mouse.up(); pg.keyboard.up('Control')
    v = V(pg)['target']
    check(v['az'] > 0.3 and v['el'] > 0.1 and pg.evaluate('__board.fen()') == fen, f"ctrl-drag orbits (az {math.degrees(v['az']):.0f}°) without tapping")
    settle(pg); pg.screenshot(path=f'{OUT}/desk_view_orbit.png')
    # left clicks still move pieces in the orbited view
    for sq in (85, 65):
        settle(pg); pt = pg.evaluate(f'__board.cellScreen({sq})'); pg.mouse.click(pt['x'], pt['y']); time.sleep(0.6)
    check(pg.evaluate('__board.ctrl.pos.moves.length') >= 1 and pg.evaluate('__board.ctrl.pos.moves[0].san') == 'e4', 'orbited view: clicks play e2-e4')
    pg.keyboard.press('v'); settle(pg); v = V(pg)['target']
    check(abs(v['az']) < EPS and abs(v['zoom'] - 1) < EPS, "'V' key resets the view")
    # quick per-game click-to-move in an orbited + zoomed view
    for g in ('xiangqi', 'flip', 'sky'):
        pg.evaluate(f'__board.local("{g}")'); time.sleep(2); idle(pg)
        pg.evaluate('__board.setView({zoom:0.75, az:0.5, el:-0.2})'); settle(pg)
        if g == 'sky':
            pg.evaluate('__board.dice(6)'); pg.evaluate('(() => { __board.roll(); return 0; })()')
            t0 = time.time()
            while not pg.evaluate('!!__board.ctrl.choices') and time.time() - t0 < 25: time.sleep(0.2)
            before = pg.evaluate('JSON.stringify(__board.ctrl.g.pos)')
            jp = pg.evaluate('(() => { const c = __board.ctrl, m = c.choices[0], p = c.jets[c.g.colour][m.plane].root.position; return __board.screenAt(p.x, 0.35, p.z); })()')
            pg.mouse.click(jp['x'], jp['y']); time.sleep(2); idle(pg)
            check(pg.evaluate('JSON.stringify(__board.ctrl.g.pos)') != before, 'desktop sky race: click launches a plane (orbited view)')
        elif g == 'flip':
            i = pg.evaluate('__board.ctrl.pos.moves()[0]'); pt = pg.evaluate(f'__board.cellScreen({i})'); pg.mouse.click(pt['x'], pt['y']); time.sleep(1.5); idle(pg)
            check(pg.evaluate(f'__board.ctrl.pos.b[{i}]') != 0, 'desktop flip: click plays a disc (orbited view)')
        else:
            pm = pg.evaluate('__board.pickMatrix()'); check(not pm['miss'], f"desktop xiangqi orbited: tap-target matrix clean ({pm['total']} spots)")
            m = pg.evaluate('(() => { const m = __board.ctrl.pos.legal().find(x => !x.cap); return {from: m.from, to: m.to}; })()'); fen0 = pg.evaluate('__board.fen()')
            for sq in (m['from'], m['to']): pt = pg.evaluate(f'__board.cellScreen({sq})'); pg.mouse.click(pt['x'], pt['y']); time.sleep(0.6)
            idle(pg); check(pg.evaluate('__board.fen()') != fen0, 'desktop xiangqi: clicks play a move (orbited view)')
    check(len(errs) == 0, f'desktop: zero console errors {errs[:3]}')
    b.close()

ONLY = sys.argv[3] if len(sys.argv) > 3 else ''
with sync_playwright() as p:
    if ONLY != 'desktop': mobile(p)
    if ONLY != 'mobile': desktop(p)
print('ALL PASSED' if not fails else f'{len(fails)} FAILED: {fails}')
sys.exit(1 if fails else 0)
