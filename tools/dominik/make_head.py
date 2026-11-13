"""Turns four views of a head (front, his left side, back, his right side) into the pixel portraits of Angry
Dominik (src/render/dominik-face.ts). Each view is given as: file x0 y0 x1 y1 (the box from the top of the hair
to the chin, ear to ear or nose to the back of the head).
usage: python3 make_head.py <out.ts> <front...> <left...> <back...> <right...>"""
import sys
from PIL import Image, ImageEnhance
out = sys.argv[1]
args = sys.argv[2:]
views = {}
SIZES = {'front': (24, 36), 'left': (30, 36), 'back': (24, 36), 'right': (30, 36)}
for i, name in enumerate(['front', 'left', 'back', 'right']):
    f, x0, y0, x1, y1 = args[i * 5:i * 5 + 5]
    W, H = SIZES[name]
    im = Image.open(f).convert('RGB').crop((int(x0), int(y0), int(x1), int(y1)))
    small = ImageEnhance.Color(ImageEnhance.Contrast(im.resize((W, H), Image.LANCZOS)).enhance(1.1)).enhance(1.15)
    rows = []
    for y in range(H):
        row = ''
        for x in range(W):
            r, g, b = small.getpixel((x, y))
            # the dark studio background is no pixel (hair and beard are dark too, but warmer)
            dark = max(r, g, b) < 62 and (r - b) < 14
            row += '......' if dark else f'{r:02x}{g:02x}{b:02x}'
        rows.append(row)
    views[name] = (W, H, rows)
with open(out, 'w') as f:
    f.write("/**\n * Angry Dominik's head: pixel portraits of it from the front, from his left, from behind and from his right,\n * row by row from the top. One pixel is one voxel of the head. Each pixel is six hex digits (rrggbb), '......'\n * is no pixel (the head's own colour shows there). Made from photos by a script; to change the head, make a\n * new file from other photos.\n */\n")
    f.write("export interface Portrait {\n  w: number;\n  h: number;\n  rows: string[];\n}\n\n")
    for name, (W, H, rows) in views.items():
        f.write(f"export const HEAD_{name.upper()}: Portrait = {{\n  w: {W},\n  h: {H},\n  rows: [\n")
        for r in rows: f.write(f"    '{r}',\n")
        f.write("  ],\n};\n\n")
# a preview of all four
total = sum(v[0] for v in views.values()) + 3 * 2
prev = Image.new('RGB', (total, 36), (255, 0, 255)); ox = 0
for name, (W, H, rows) in views.items():
    for y, r in enumerate(rows):
        for x in range(W):
            c = r[x * 6:x * 6 + 6]
            prev.putpixel((ox + x, y), (30, 30, 50) if c == '......' else tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)))
    ox += W + 2
prev.resize((total * 10, 360), Image.NEAREST).save('head_preview.png')
