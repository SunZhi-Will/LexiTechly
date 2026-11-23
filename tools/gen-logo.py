"""Regenerate the Readloop logo: SVG source plus 512/128/48/32/16 PNGs.

Usage: python3 tools/gen-logo.py src/assets/images
Needs Pillow and Playwright's chrome-headless-shell (npx playwright install chromium-headless-shell).
32 and 16 px use a simplified mark (thicker ring, no faint text lines).
Also writes _preview.png (light and dark backgrounds); delete it afterwards.
"""
import math, subprocess, sys, os
from PIL import Image
OUT = sys.argv[1]  # output dir
SHELL = os.path.expanduser("~/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell")

def pt(cx, cy, r, deg):
    a = math.radians(deg); return (cx + r*math.cos(a), cy + r*math.sin(a))

def svg(simple=False):
    cx, cy, r = 256, 258, 138
    sw = 60 if simple else 46
    a0, a1 = (-64 if simple else -52), (230 if simple else 236)            # arc runs clockwise from a0 to a1; the gap at the top holds the arrowhead
    x0, y0 = pt(cx, cy, r, a0); x1, y1 = pt(cx, cy, r, a1)
    # arrowhead at the arc end, pointing along the clockwise tangent
    t = math.radians(a1); tx, ty = -math.sin(t), math.cos(t); nx, ny = math.cos(t), math.sin(t)
    hw = sw*(1.05 if simple else 0.95); hl = sw*(1.15 if simple else 1.05)
    tip = (x1 + tx*hl, y1 + ty*hl); b1 = (x1 + nx*hw, y1 + ny*hw); b2 = (x1 - nx*hw, y1 - ny*hw)
    f = lambda p: f"{p[0]:.1f} {p[1]:.1f}"
    lines = "" if simple else (
        '  <rect x="190" y="186" width="132" height="22" rx="12" fill="#ffffff" opacity="0.45"/>\n'
        '  <rect x="190" y="308" width="96" height="22" rx="12" fill="#ffffff" opacity="0.45"/>\n')
    hl_rect = ('<rect x="184" y="224" width="144" height="68" rx="22" fill="url(#hl)"/>' if simple else
               '<rect x="160" y="226" width="192" height="64" rx="20" fill="url(#hl)"/>\n'
               '  <rect x="186" y="249" width="140" height="18" rx="9" fill="#163a99"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Readloop: a highlighted word inside a reading loop (read, look up, keep, review) -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4c8dff"/>
      <stop offset="1" stop-color="#1747c9"/>
    </linearGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffd84d"/>
      <stop offset="1" stop-color="#ffb020"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bg)"/>
  <!-- loop -->
  <path d="M{f((x0,y0))} A{r} {r} 0 1 1 {f((x1,y1))}" fill="none" stroke="#ffffff" stroke-width="{sw}" stroke-linecap="round"/>
  <path d="M{f(b1)} L{f(tip)} L{f(b2)} Z" fill="#ffffff" stroke="#ffffff" stroke-width="{sw*0.25:.1f}" stroke-linejoin="round"/>
{lines}  <!-- highlighted word -->
  {hl_rect}
</svg>
'''

def render(svgtext, path):
    html = path + ".html"
    open(html, "w").write(f'<html><body style="margin:0;background:transparent">{svgtext}</body></html>')
    subprocess.run([SHELL, "--headless", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
                    "--window-size=512,512", f"--screenshot={path}", "file://" + html], check=True, capture_output=True)
    os.remove(html)

full = svg(False); simple = svg(True)
open(os.path.join(OUT, "logo.svg"), "w").write(full)
tmp_full = os.path.join(OUT, "_full512.png"); tmp_simple = os.path.join(OUT, "_simple512.png")
render(full, tmp_full); render(simple, tmp_simple)
big = Image.open(tmp_full).convert("RGBA"); small = Image.open(tmp_simple).convert("RGBA")
big.save(os.path.join(OUT, "logo.png"))
for s, src in ((128, big), (48, big), (32, small), (16, small)):
    src.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f"logo{s}.png"))
big.resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, "icon128.png"))
os.remove(tmp_full); os.remove(tmp_simple)
# preview sheet on light and dark backgrounds
sheet = Image.new("RGBA", (760, 300), (255, 255, 255, 255))
for row, bgc in enumerate([(255, 255, 255, 255), (32, 33, 36, 255)]):
    band = Image.new("RGBA", (760, 150), bgc); x = 10
    for s in (128, 48, 32, 16):
        im = Image.open(os.path.join(OUT, f"logo{s}.png")); band.alpha_composite(im, (x, (150 - s)//2)); x += s + 20
    z = Image.open(os.path.join(OUT, "logo16.png")).resize((128, 128), Image.NEAREST); band.alpha_composite(z, (x + 20, 11))
    z = Image.open(os.path.join(OUT, "logo32.png")).resize((128, 128), Image.NEAREST); band.alpha_composite(z, (x + 170, 11))
    sheet.alpha_composite(band, (0, row*150))
sheet.save(os.path.join(OUT, "_preview.png"))
print("ok")
