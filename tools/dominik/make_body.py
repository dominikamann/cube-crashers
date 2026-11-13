"""Turns three photos of a standing figure (front, side facing right, back) into the voxel body of Angry Dominik
(src/render/dominik-body.ts): from under the chin down to the knees, with the shoulders but without the arms.
His outline and the folds of the shirt come from the photos; front to back he is made flatter and straighter
than the side photo has him, and a little narrower at the waist. The shirt becomes a black one with the
AmannLabs mark on the chest and on the back (there with the address under it); it closes over the top of the
body, where the photo shows his neck (the neck is a part of its own, see dominik-limbs.ts);
the jeans become plain navy shorts to the knee that hang straight.
usage: python3 make_body.py <out.ts> <front.png> <side.png> <back.png> <mark.png> <skin rrggbb>
(the skin tone is the one make_head.py prints: it is only handed on, for the neck, the arms and the legs)"""
import sys
from PIL import Image
out, fFront, fSide, fBack, fMark, SKIN = sys.argv[1:7]
PX = 11.2 / 3                       # one voxel of the body in the photos
TOP, KNEE = 228, 1050          # the base of the neck and the knees
HEM = 705                      # where the shirt ends
COLS = 132
CX = {'front': 572, 'back': 575}
SIDE_C = 555                   # the middle of the body in the side photo
ARMPIT = (292, 340)            # the shoulders are whole down to here; from there on only what is between the arms
SHOULDERS, TORSO = 246, 175    # half the width of each
WAIST = (400, 0.92)            # from here down he narrows, to this share of his width at the hem
CHEST_DEEP, HEM_DEEP = (-29, 25), (-25, 21)   # how far he reaches back and forward at the chest and at the hem
FLAT = 0.9                    # the share of the trunk's width that is flat in front and behind
ROWS = int((KNEE - TOP) / PX)
HEM_ROW = int((HEM - TOP) / PX)
BLACK = (0x1b, 0x1c, 0x21)     # the shirt
INK = (0xe6, 0xe9, 0xf0)       # the lettering on its back
NAVY = (0x20, 0x29, 0x5c)      # the shorts
CHEST = (54, 30)               # the mark on the shirt: its width in voxels, and the row its top is in
KNEE_LEG = (16.5, 13.5)        # a leg of the shorts at the knee: its middle and half its width, from his middle
KNEE_DEEP = (-15, 13)          # and how far it reaches to the back and to the front there
TEXT = 'WWW.AMANNLABS.EU'
FONT = {
    'W': ['X...X', 'X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', '.X.X.'], 'M': ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
    'A': ['.XX.', 'X..X', 'X..X', 'XXXX', 'X..X', 'X..X', 'X..X'], 'N': ['X..X', 'XX.X', 'XX.X', 'X.XX', 'X.XX', 'X..X', 'X..X'],
    'L': ['X...', 'X...', 'X...', 'X...', 'X...', 'X...', 'XXXX'], 'B': ['XXX.', 'X..X', 'X..X', 'XXX.', 'X..X', 'X..X', 'XXX.'],
    'S': ['.XXX', 'X...', 'X...', '.XX.', '...X', '...X', 'XXX.'], 'E': ['XXXX', 'X...', 'X...', 'XXX.', 'X...', 'X...', 'XXXX'],
    'U': ['X..X', 'X..X', 'X..X', 'X..X', 'X..X', 'X..X', '.XX.'], '.': ['.', '.', '.', '.', '.', 'X', 'X'],
}

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
    for yy in range(int(y0), int(y0 + PX) + 1):
        for xx in range(int(x0), int(x0 + PX) + 1):
            total += 1
            if figure(im, bg, xx, yy):
                n += 1; c = im.getpixel((xx, yy))
                for i in range(3): acc[i] += c[i]
    return None if n < total * 0.5 else tuple(a // n for a in acc)
def skin(c):
    return c[0] > 120 and c[0] - c[2] > 40
def shirt(c):
    """how light the photo's shirt is here against its usual tone: its folds (its print does not count)"""
    return 1.0 if c[2] - c[0] > 22 or skin(c) else max(0.6, min(1.5, (sum(c) / 3) / 46))
def cloth(rows):
    """black cloth with the folds of the photo's shirt, but soft: an even black, only gently shaded"""
    Hh, W = len(rows), len(rows[0])
    for r in range(Hh):
        for c in range(W):
            if not isinstance(rows[r][c], float): continue
            near = [rows[rr][cc] for rr in range(max(0, r - 3), min(Hh, r + 4)) for cc in range(max(0, c - 3), min(W, c + 4)) if isinstance(rows[rr][cc], float)]
            yield r, c, tuple(min(255, int(v * (1 + (sum(near) / len(near) - 1) * 0.55))) for v in BLACK)

def mark(width):
    """the AmannLabs mark as rows of pixels `width` wide (None where it is clear)"""
    im = Image.open(fMark).convert('RGBA')
    box = im.getbbox(); im = im.crop(box)
    h = round(width * im.size[1] / im.size[0])
    rows = []
    for y in range(h):
        row = []
        for x in range(width):
            acc = [0, 0, 0]; a = 0; n = 0
            for yy in range(int(y * im.size[1] / h), max(int((y + 1) * im.size[1] / h), int(y * im.size[1] / h) + 1)):
                for xx in range(int(x * im.size[0] / width), max(int((x + 1) * im.size[0] / width), int(x * im.size[0] / width) + 1)):
                    r, g, b, al = im.getpixel((xx, yy)); n += 1; a += al
                    for i, v in enumerate((r, g, b)): acc[i] += v * al
            if a < n * 255 * 0.5: row.append(None); continue
            c = [v / a for v in acc]
            # a little more colour than the image has: it is paint on cloth here, not light
            m = sum(c) / 3
            row.append(tuple(max(0, min(255, int(m + (v - m) * 1.25))) for v in c))
        rows.append(row)
    return rows
def stamp(view, rows, top, middle):
    """prints `rows` on the cloth, but only on the flat of it: nothing of a print may turn round to his sides"""
    for r, line in enumerate(rows):
        y = top + r
        have = [i for i, c in enumerate(view[y]) if c]
        mid, half = (have[0] + have[-1]) / 2, (have[-1] - have[0] + 1) / 2
        for c, col in enumerate(line):
            x = middle - len(line) // 2 + c
            if col and view[y][x] and abs(x - mid) <= flat[y] * half - 0.5: view[y][x] = col

def ease(lo, hi, v):
    t = max(0.0, min(1.0, (v - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)
views = {}
for name, f in (('front', fFront), ('back', fBack)):
    im, bg = load(f, 60 if name == 'front' else 84)
    rows = []
    for r in range(HEM_ROW):
        y = TOP + r * PX
        reach = SHOULDERS + (TORSO - SHOULDERS) * ease(ARMPIT[0], ARMPIT[1], y)
        slim = 1 + (WAIST[1] - 1) * ease(WAIST[0], HEM, y)
        row = []
        for c in range(COLS):
            x = CX[name] + (c - COLS / 2) * PX / slim
            # below the shoulders only what is between the arms; the arms are parts of their own
            if abs(x + PX / 2 - CX[name]) > reach: row.append(None); continue
            row.append(block(im, bg, x, y))
        have = [i for i, c in enumerate(row) if c]
        if have:
            for i in range(have[0], have[-1] + 1):
                if not row[i]: row[i] = row[min(have, key=lambda h: abs(h - i))]
        rows.append([None if c is None else shirt(c) for c in row])
    for r, c, col in list(cloth(rows)): rows[r][c] = col
    # (a row that sticks out beyond the ones above and below it is a stray shadow, not him)
    edge = [([i for i, c in enumerate(row) if c] or [COLS, -1]) for row in rows]
    for r in range(HEM_ROW):
        near = range(max(0, r - 3), min(HEM_ROW, r + 4))
        lo, hi = sorted(edge[q][0] for q in near)[len(near) // 2], sorted(edge[q][-1] for q in near)[len(near) // 2]
        rows[r] = [c if lo - 1 <= i <= hi + 1 else None for i, c in enumerate(rows[r])]
    views[name] = rows
# the slope from the neck to the shoulders is lit brightly from the front and hard to tell from the backdrop
# there: the front takes its outline from the back (mirrored: the two photos look at him from opposite sides)
for r in range(int((ARMPIT[0] - TOP) / PX)):
    for c in range(COLS):
        if views['back'][r][COLS - 1 - c] and not views['front'][r][c]: views['front'][r][c] = BLACK
# (the narrow rows on top are his neck: that is a part of its own; the body starts with the shoulders)
for name in views:
    for r in range(40):
        if sum(1 for c in views[name][r] if c) < 40: views[name][r] = [None] * COLS

# how deep he is in every row: the side photo gives it for the neck and the shoulders; from the chest down he
# is kept flat (a straight line in front and behind, a little slimmer at the waist) instead of following his
# belly, and the trunk gets flat faces in front and behind for the prints
im, bg = load(fSide, 84)
depth = []
for r in range(ROWS):
    y = TOP + (r + 0.5) * PX
    xs = [x for x in range(380, 745, 2) if figure(im, bg, x, int(y))]
    back, front = ((min(xs) - SIDE_C) / PX, (max(xs) - SIDE_C) / PX) if xs else (-8, 8)
    k = max(0.0, min(1.0, (y - 380) / (HEM - 380)))
    back = max(back, CHEST_DEEP[0] + (HEM_DEEP[0] - CHEST_DEEP[0]) * k)
    front = min(front, CHEST_DEEP[1] + (HEM_DEEP[1] - CHEST_DEEP[1]) * k)
    # (his chin hangs over the top of the neck in that photo)
    if y < 262: front = min(front, 12.5)
    depth.append((back, front))
depth = [tuple(sum(d[i] for d in depth[max(0, r - 3):r + 4]) / len(depth[max(0, r - 3):r + 4]) for i in (0, 1)) for r in range(ROWS)]
flat = [FLAT * ease(ARMPIT[0], ARMPIT[1], TOP + r * PX) for r in range(ROWS)]

# the shorts are drawn, not photographed: they start under the hem of the shirt, no wider and no deeper than
# the belly above them, and hang straight down to two legs that part at the crotch; a lighter hem at the knee,
# and a shade darker toward the sides so the legs read as round
hips = [i for i, c in enumerate(views['front'][HEM_ROW - 1]) if c]
half = (hips[-1] - hips[0] + 1) // 2 - 2
belly = depth[HEM_ROW - 1]
CROTCH = HEM_ROW + 30
outer_knee = KNEE_LEG[0] + KNEE_LEG[1]
gap_knee = KNEE_LEG[0] - KNEE_LEG[1]
for r in range(HEM_ROW, ROWS):
    k = (r - HEM_ROW) / (ROWS - 1 - HEM_ROW)
    outer = outer_knee + (half - outer_knee) * (1 - k) ** 1.3
    gap = 0 if r < CROTCH else min(gap_knee, 1 + (r - CROTCH) * 0.5)
    mid, wide = (gap + outer) / 2, (outer - gap) / 2
    for name in ('front', 'back'):
        row = []
        for c in range(COLS):
            x = c + 0.5 - COLS / 2
            if abs(x) > outer or abs(x) < gap: row.append(None); continue
            # round over each leg below the crotch, over the hips above it
            t = abs(x) / outer if r < CROTCH else abs(abs(x) - mid) / wide
            lum = 1.08 - 0.3 * t ** 2.2
            if ROWS - r <= 4: lum *= 1.32
            elif ROWS - r == 5: lum *= 0.8
            if r < CROTCH and abs(x) < 1: lum *= 0.85
            row.append(tuple(min(255, int(v * lum)) for v in NAVY))
        views[name].append(row)
    depth[r] = (KNEE_DEEP[0] + (belly[0] + 1 - KNEE_DEEP[0]) * (1 - k) ** 1.4, KNEE_DEEP[1] + (belly[1] - 1 - KNEE_DEEP[1]) * (1 - k) ** 1.4)
    flat[r] = 0.6 if r < CROTCH else 0
depth = [(round(a, 2), round(b, 2), round(f, 2)) for (a, b), f in zip(depth, flat)]

# the mark: big on the chest and on the back; under the one on the back the address, in small letters
big = mark(CHEST[0])
stamp(views['front'], big, CHEST[1], COLS // 2)
stamp(views['back'], big, CHEST[1] - 4, COLS // 2)
line = [[] for _ in range(7)]
for ch in TEXT:
    for i in range(7): line[i] += [INK if p == 'X' else None for p in FONT[ch][i]] + [None]
stamp(views['back'], line, CHEST[1] - 4 + len(big) + 6, COLS // 2)

DEEP = int(max(max(-a, b) for a, b, _ in depth) * 2 + 2)
def enc(row): return ''.join('......' if c is None else '%02x%02x%02x' % c for c in row)
with open(out, 'w') as f:
    f.write("/**\n * Angry Dominik's body from under the chin to the knees, with the shoulders but without the arms and the neck:\n * what he looks like from the front and from behind (row by row from the top, a pixel is six hex digits,\n * '......' is no body there, in the order of the photos: left to right as the camera saw him) and, per row, how\n * far he reaches to the back and to the front (in voxels from his middle) and the share of the row's width that\n * is flat in front and behind. `leg` is where a leg of the shorts ends at the knee: its middle and half its\n * width, in voxels from his middle; `skin` is the tone of his skin (that of his face). Made from photos by a\n * script: his outline and the folds of the shirt are his; the black of the shirt, the AmannLabs mark and the\n * address on it and the shorts are drawn.\n */\n")
    f.write(f"export const BODY = {{\n  cols: {COLS},\n  rows: {ROWS},\n  deep: {DEEP},\n  leg: [{KNEE_LEG[0]}, {KNEE_LEG[1]}],\n  skin: '{SKIN}',\n  front: [\n")
    for r in views['front']: f.write(f"    '{enc(r)}',\n")
    f.write("  ],\n  back: [\n")
    for r in views['back']: f.write(f"    '{enc(r)}',\n")
    f.write("  ],\n  depth: [\n")
    for d in depth: f.write(f"    [{d[0]}, {d[1]}, {d[2]}],\n")
    f.write("  ] as [number, number, number][],\n};\n")
# preview
prev = Image.new('RGB', (COLS * 2 + 4, ROWS), (255, 0, 255))
for vi, name in enumerate(('front', 'back')):
    for r, row in enumerate(views[name]):
        for c, col in enumerate(row):
            prev.putpixel((vi * (COLS + 4) + c, r), col or (90, 90, 110))
prev.resize((prev.size[0] * 4, prev.size[1] * 4), Image.NEAREST).save('body_preview.png')
print(COLS, ROWS, DEEP, 'hem', HEM_ROW, 'half', half, 'belly', belly)
