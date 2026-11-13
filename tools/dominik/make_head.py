"""Turns four views of a head (front, his left side, back, his right side) into the pixel portraits of Angry
Dominik (src/render/dominik-face.ts). Each view is given as: file x0 y0 x1 y1 (the box from the top of the hair
to the chin, ear to ear or nose to the back of the head). The portraits reach a little below the chin, down the
neck to the collar. Every portrait is a clean outline: one stretch of pixels per row, nothing of the backdrop.
usage: python3 make_head.py <out.ts> <front...> <left...> <back...> <right...>"""
import sys
from PIL import Image, ImageEnhance
out = sys.argv[1]
args = sys.argv[2:]
H, NECK = 48, 0                 # rows from the hair to the chin, and rows of neck under it
SIZES = {'front': 32, 'left': 43, 'back': 32, 'right': 43}
# between his nose and his upper lip (rows and columns of the front view, as shares of it): plain skin there.
# At this size the shadow under the nose and the stubble would run into one dark block
LIP = ((0.6, 0.69), (0.26, 0.74))

def backdrop(c):
    """the dark studio background and the black shirt (hair and beard are dark too, but warmer)"""
    r, g, b = c
    return (max(r, g, b) < 58 and (r - b) < 13) or (max(r, g, b) < 120 and max(r, g, b) - min(r, g, b) < 20)

def cells(f, x0, y0, x1, y1, W):
    """the view as W x (H + NECK) cells: the mean colour of what is head in each, or None"""
    im = Image.open(f).convert('RGB')
    sx, sy = (x1 - x0) / W, (y1 - y0) / H
    # (a cell that is all head takes its colour from the photo scaled down in one go, a touch crisper: that keeps
    # eyes and mouth sharp; a cell on the outline takes the mean of what is head in it, without the backdrop)
    small = im.crop((x0, y0, x1, int(y0 + (H + NECK) * sy))).resize((W, H + NECK), Image.LANCZOS)
    small = ImageEnhance.Color(ImageEnhance.Contrast(small).enhance(1.1)).enhance(1.12)
    grid = []
    for row in range(H + NECK):
        line = []
        for col in range(W):
            n = total = 0; acc = [0, 0, 0]
            for yy in range(int(y0 + row * sy), int(y0 + (row + 1) * sy) + 1):
                for xx in range(int(x0 + col * sx), int(x0 + (col + 1) * sx) + 1):
                    if xx < 0 or yy < 0 or xx >= im.size[0] or yy >= im.size[1]: continue
                    total += 1
                    c = im.getpixel((xx, yy))
                    if not backdrop(c):
                        n += 1
                        for i in range(3): acc[i] += c[i]
            line.append(None if not total or n < total * 0.45 else small.getpixel((col, row)) if n >= total * 0.97 else tuple(a // n for a in acc))
        grid.append(line)
    return grid

def biggest(grid):
    """only the largest piece that hangs together: specks of backdrop and a neighbour's hair go"""
    Hh, W = len(grid), len(grid[0])
    seen = [[False] * W for _ in range(Hh)]
    best = []
    for y in range(Hh):
        for x in range(W):
            if seen[y][x] or grid[y][x] is None: continue
            piece = []; todo = [(x, y)]; seen[y][x] = True
            while todo:
                cx, cy = todo.pop(); piece.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < Hh and not seen[ny][nx] and grid[ny][nx] is not None:
                        seen[ny][nx] = True; todo.append((nx, ny))
            if len(piece) > len(best): best = piece
    keep = set(best)
    return [[grid[y][x] if (x, y) in keep else None for x in range(W)] for y in range(Hh)]

def solid(grid):
    """one stretch per row, holes filled with the pixel beside them"""
    for line in grid:
        have = [i for i, c in enumerate(line) if c]
        if not have: continue
        for i in range(have[0], have[-1] + 1):
            if not line[i]: line[i] = line[min(have, key=lambda h: abs(h - i))]
    return grid

views = {}
for i, name in enumerate(['front', 'left', 'back', 'right']):
    f, x0, y0, x1, y1 = args[i * 5:i * 5 + 5]
    views[name] = solid(biggest(cells(f, int(x0), int(y0), int(x1), int(y1), SIZES[name])))
# both sides have the same outline: what the right view shows beyond the left one's (a neighbour on the sheet) goes
W = SIZES['right']
for y, line in enumerate(views['right']):
    for x in range(W):
        if not any(views['left'][y][W - 1 - xx] for xx in range(max(0, x - 2), min(W, x + 3))): line[x] = None
views['right'] = solid(biggest(views['right']))
# the photos were not lit alike: the front takes the skin tone of the sides (measured on the cheeks)
CHEEK = range(int(H * 0.5), int(H * 0.7))
def cheek(g, cols):
    acc = [0, 0, 0]; n = 0
    for y in CHEEK:
        for x in range(int(len(g[y]) * cols[0]), int(len(g[y]) * cols[1])):
            if g[y][x]:
                n += 1
                for k in range(3): acc[k] += g[y][x][k]
    return [a / max(1, n) for a in acc]
sides = [cheek(views['left'], (0.12, 0.4)), cheek(views['right'], (0.6, 0.88))]
have = cheek(views['front'], (0.25, 0.75))
gain = [max(0.8, min(1.25, (sides[0][k] + sides[1][k]) / 2 / max(1, have[k]))) for k in range(3)]
views['front'] = [[None if c is None else tuple(min(255, int(c[k] * gain[k])) for k in range(3)) for c in line] for line in views['front']]

# the face a little crisper: every pixel of the front view moves away from the mean of those around it
g = views['front']; W = SIZES['front']
def around(y, x):
    near = [g[yy][xx] for yy in range(max(0, y - 1), min(H + NECK, y + 2)) for xx in range(max(0, x - 1), min(W, x + 2)) if g[yy][xx]]
    return [sum(c[k] for c in near) / len(near) for k in range(3)]
views['front'] = g = [[None if c is None else tuple(max(0, min(255, int(c[k] + 0.45 * (c[k] - around(y, x)[k])))) for k in range(3)) for x, c in enumerate(line)] for y, line in enumerate(g)]
# the skin between nose and lip: as light as his cheeks, fading out at the rim of that patch
cheeks = sorted((g[y][x] for y in range(int(H * 0.55), int(H * 0.62)) for x in list(range(int(W * 0.14), int(W * 0.28))) + list(range(int(W * 0.72), int(W * 0.86))) if g[y][x]), key=sum)
plain = cheeks[len(cheeks) // 2]
rows, cols = range(round(H * LIP[0][0]), round(H * LIP[0][1])), range(round(W * LIP[1][0]), round(W * LIP[1][1]))
for y in rows:
    for x in cols:
        rim = y == rows[0] or x in (cols[0], cols[-1])
        if g[y][x]: g[y][x] = tuple(max(g[y][x][k], int(plain[k] * (0.9 if rim else 0.97))) for k in range(3))

with open(out, 'w') as f:
    f.write("/**\n * Angry Dominik's head: pixel portraits of it from the front, from his left, from behind and from his right,\n * row by row from the top of the hair down to the collar. One pixel is one voxel of the head. Each pixel is six\n * hex digits (rrggbb), '......' is no head there: the outlines of the portraits are the shape of the head. Made\n * from photos by a script; to change the head, make a new file from other photos.\n */\n")
    f.write("export interface Portrait {\n  w: number;\n  h: number;\n  rows: string[];\n}\n\n")
    f.write(f"/** the tone of his skin (his cheeks): arms, legs and neck are made in it */\nexport const HEAD_SKIN = '{'%02x%02x%02x' % plain}';\n\n")
    print('%02x%02x%02x' % plain)
    for name, g in views.items():
        f.write(f"export const HEAD_{name.upper()}: Portrait = {{\n  w: {SIZES[name]},\n  h: {H + NECK},\n  rows: [\n")
        for line in g: f.write("    '" + ''.join('......' if c is None else '%02x%02x%02x' % c for c in line) + "',\n")
        f.write("  ],\n};\n\n")
# a preview of all four
total = sum(SIZES.values()) + 3 * 2
prev = Image.new('RGB', (total, H + NECK), (255, 0, 255)); ox = 0
for name, g in views.items():
    for y, line in enumerate(g):
        for x, c in enumerate(line): prev.putpixel((ox + x, y), c or (30, 30, 50))
    ox += SIZES[name] + 2
prev.resize((total * 10, (H + NECK) * 10), Image.NEAREST).save('head_preview.png')
