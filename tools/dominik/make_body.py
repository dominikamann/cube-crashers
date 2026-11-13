"""Turns three photos of a standing figure (front, side facing right, back) into the voxel body of Angry Dominik
(src/render/dominik-body.ts): from the base of the neck down to the knees, without the arms. The jeans become
shorts with the AmannLabs A on them.
usage: python3 make_body.py <out.ts> <front.png> <side.png> <back.png>"""
import sys
from PIL import Image
out, fFront, fSide, fBack = sys.argv[1:5]
PX = 11.2                      # one voxel of the body in the photos
TOP, KNEE = 228, 1050          # the base of the neck and the knees
HEM = 705                      # where the shirt ends
COLS = 36
CX = {'front': 572, 'back': 575}
SIDE_C = 555                   # the middle of the body in the side photo
TORSO = (398, 748)             # between the arms (front and back), below the shoulders
ROWS = int((KNEE - TOP) / PX)

def load(f, dark):
    return Image.open(f).convert('RGB'), dark
def figure(im, dark, x, y):
    """the studio background is a plain grey: the figure is whatever has colour, or is darker than it"""
    if x < 0 or y < 0 or x >= im.size[0] or y >= im.size[1]: return False
    r, g, b = im.getpixel((x, y))
    return max(r, g, b) - min(r, g, b) > 24 or max(r, g, b) < dark
def block(im, bg, x0, y0):
    """the colour of one voxel: the mean of the figure's pixels in it, or None if most of it is background"""
    n = 0; acc = [0, 0, 0]; total = 0
    for yy in range(int(y0), int(y0 + PX), 2):
        for xx in range(int(x0), int(x0 + PX), 2):
            total += 1
            if figure(im, bg, xx, yy):
                n += 1; c = im.getpixel((xx, yy))
                for i in range(3): acc[i] += c[i]
    return None if n < total * 0.5 else tuple(a // n for a in acc)

A = ['...X...', '..X.X..', '..X.X..', '.XXXXX.', '.X...X.', 'X.....X']
NAVY = (0x2a, 0x33, 0x6a)
def shorts(c, y):
    lum = sum(c) / 3 / 92
    lum = max(0.55, min(1.5, lum))
    return tuple(min(255, int(v * lum)) for v in NAVY)

views = {}
for name, f in (('front', fFront), ('back', fBack)):
    im, bg = load(f, 60 if name == 'front' else 84)
    rows = []
    for r in range(ROWS):
        y = TOP + r * PX
        row = []
        for c in range(COLS):
            x = CX[name] + (c - COLS / 2) * PX
            mid = x + PX / 2
            # below the shoulders only what is between the arms; the arms are parts of their own
            if y > 300 and not (TORSO[0] <= mid <= TORSO[1]): row.append(None); continue
            col = block(im, bg, x, y)
            if col and y >= (HEM if name == 'front' else HEM + 14): col = shorts(col, y)
            row.append(col)
        if y < 790:
            have = [i for i, c in enumerate(row) if c]
            if have:
                for i in range(have[0], have[-1] + 1):
                    if not row[i]:
                        near = min(have, key=lambda h: abs(h - i))
                        row[i] = row[near]
        rows.append(row)
    views[name] = rows
# the legs: the washed-out front of the jeans is hard to tell from the grey behind it, so the front takes the
# outline of the back (mirrored: the two photos look at him from opposite sides)
for r in range(ROWS):
    if TOP + r * PX < 790: continue
    for c in range(COLS):
        there = views['back'][r][COLS - 1 - c] is not None
        if there and views['front'][r][c] is None:
            row = [x for x in views['front'][r] if x]
            views['front'][r][c] = row[0] if row else NAVY
        if not there: views['front'][r][c] = None
# the A on the front of the shorts: under the hem, in the middle
hem_row = int((HEM - TOP) / PX) + 1
for ar, line in enumerate(A):
    for ac, ch in enumerate(line):
        if ch == 'X':
            r, c = hem_row + 1 + ar, COLS // 2 - 4 + ac
            if views['front'][r][c]: views['front'][r][c] = (0x2b, 0xf0, 0xff) if ar < 3 else (0xff, 0x2b, 0xd6)

im, bg = load(fSide, 84)
depth = []
for r in range(ROWS):
    y = int(TOP + (r + 0.5) * PX)
    xs = [x for x in range(380, 745, 2) if figure(im, bg, x, y)]
    if not xs: depth.append((-4, 4)); continue
    depth.append((round((min(xs) - SIDE_C) / PX, 2), round((max(xs) - SIDE_C) / PX, 2)))
DEEP = int(max(max(-a, b) for a, b in depth) * 2 + 2)

def enc(row): return ''.join('......' if c is None else '%02x%02x%02x' % c for c in row)
with open(out, 'w') as f:
    f.write("/**\n * Angry Dominik's body from the base of the neck to the knees, without the arms: what he looks like from the\n * front and from behind (row by row from the top, a pixel is six hex digits, '......' is no body there, in the\n * order of the photos: left to right as the camera saw him) and how far he reaches to the back and to the front\n * in each row (in voxels from his middle). Made from photos by a script; the jeans became shorts.\n */\n")
    f.write(f"export const BODY = {{\n  cols: {COLS},\n  rows: {ROWS},\n  deep: {DEEP},\n  front: [\n")
    for r in views['front']: f.write(f"    '{enc(r)}',\n")
    f.write("  ],\n  back: [\n")
    for r in views['back']: f.write(f"    '{enc(r)}',\n")
    f.write("  ],\n  depth: [\n")
    for a, b in depth: f.write(f"    [{a}, {b}],\n")
    f.write("  ] as [number, number][],\n};\n")
# preview
prev = Image.new('RGB', (COLS * 2 + 4, ROWS), (255, 0, 255))
for vi, name in enumerate(('front', 'back')):
    for r, row in enumerate(views[name]):
        for c, col in enumerate(row):
            prev.putpixel((vi * (COLS + 4) + c, r), col or (30, 30, 50))
prev.resize((prev.size[0] * 8, prev.size[1] * 8), Image.NEAREST).save('body_preview.png')
print(COLS, ROWS, DEEP, depth[::8])
