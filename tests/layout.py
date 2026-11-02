"""390px layout guard for CYBER BOARD.
Usage: python tests/layout.py [base_url]
Checks: the start title fits without clipping; all four game cards are inside the viewport; zero console errors.
"""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:18977/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '?reset=1&quality=low')
    pg.wait_for_selector('#screen-start h1.title', timeout=30000)
    title = pg.evaluate("""() => { const h=document.querySelector('#screen-start h1.title'); return {text:h.textContent, scrollW:h.scrollWidth, clientW:h.clientWidth}; }""")
    check(title['scrollW'] <= title['clientW'], f"start title fits ({title['text']}: {title['scrollW']} <= {title['clientW']})")
    cards = pg.evaluate("[...document.querySelectorAll('.gcard')].map(e => { const r=e.getBoundingClientRect(); return {game:e.dataset.game, top:Math.round(r.top), bottom:Math.round(r.bottom), right:Math.round(r.right)}; })")
    check(len(cards) == 4 and all(c['top'] >= 0 and c['bottom'] <= 844 and c['right'] <= 390 for c in cards), f'four game cards inside 390x844 ({cards})')
    check(not errs, f'zero console errors {errs[:3]}')
    b.close()
print('ALL PASSED' if not fails else f'{len(fails)} FAILED')
sys.exit(1 if fails else 0)
