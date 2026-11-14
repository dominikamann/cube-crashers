"""The board fences of the Town: one across every gap between the real buildings that one can look into from the
street but not walk through, a little way in from the fronts, from wall to wall. Reads the plan (floor-waldsee.ts),
the tile codes and barriers (waldsee-town.ts) and the real buildings (waldsee-lod2.ts) and writes WALDSEE_FENCE_RUNS
back into waldsee-lod2.ts. Prints the barriers, every fence, what it left open, and an overview.
usage: python3 -I fences.py <repo root> [--write] [--zoom x0 x1 z0 z1]"""
import sys, math
from collections import deque
WRITE = '--write' in sys.argv
ARGS = sys.argv[:]
sys.argv = sys.argv[:2]
# ---- the Town's data, read out of the TS sources; shown() and waldseeGround() as in waldsee-look.ts
import re, json, os
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
N = 128

def rd(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
floor_src = rd('src/sim/config/floor-waldsee.ts')
town_src = rd('src/sim/config/waldsee-town.ts')
lod_src = rd('src/render/waldsee-lod2.ts')

rows = re.findall(r"^  '([#.=]{%d})',$" % N, floor_src, re.M)
assert len(rows) == N
codes = re.findall(r"^  '([0-9a-z]{%d})',$" % (2 * N), town_src, re.M)[:N]
assert len(codes) == N
def code(x, z):
    if x < 0 or z < 0 or x >= N or z >= N: return 1
    return int(codes[z][2 * x:2 * x + 2], 36)
def tsarr(src, name):
    m = re.search(r"export const %s[^=]*= (\[.*?\]);\n" % name, src, re.S)
    return json.loads(re.sub(r",\s*\]", "]", m.group(1)))
LOD2 = tsarr(lod_src, 'WALDSEE_LOD2')
FENCE_RUNS = tsarr(lod_src, 'WALDSEE_FENCE_RUNS')
HIDDEN = tsarr(town_src, 'WALDSEE_HIDDEN')
DROWNED = tsarr(town_src, 'WALDSEE_DROWNED')
ALLEY = tsarr(town_src, 'WALDSEE_ALLEY')
REPLACED = tsarr(town_src, 'WALDSEE_REPLACED')
BUILT = {int(m) for m in re.findall(r"\{ house: (\d+), x0", town_src)}
BARRIERS = []
for m in re.finditer(r"\{ at: \[([-\d.]+), ([-\d.]+)\], dir: \[([-\d.]+), ([-\d.]+)\], half: ([-\d.]+), lake: (true|false)(, ends: (\[\[.*?\]\]))? \}", town_src):
    BARRIERS.append({'at': (float(m.group(1)), float(m.group(2))), 'dir': (float(m.group(3)), float(m.group(4))), 'half': float(m.group(5)), 'lake': m.group(6) == 'true', 'ends': json.loads(m.group(8)) if m.group(8) else None})

taken_away = lambda c: c >= 6 and (c - 6) in HIDDEN
# drowned islands (port)
def passable(x, z):
    if x < 0 or z < 0 or x >= N or z >= N: return False
    c = code(x, z)
    if c in (1, 2, 3, 4, 5): return True
    if c >= 6: return (c - 6) not in HIDDEN
    return False
seen = set(); q = []
for z in range(N):
    for x in range(N):
        c = code(x, z)
        solid = (c >= 6 and (c - 6) not in HIDDEN) or c in (1, 2, 3)
        if solid and (x, z) not in seen: seen.add((x, z)); q.append((x, z))
while q:
    x, z = q.pop()
    for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, nz = x + dx, z + dz
        if passable(nx, nz) and (nx, nz) not in seen: seen.add((nx, nz)); q.append((nx, nz))
ISLANDS = {(x, z) for z in range(N) for x in range(N) if code(x, z) in (4, 5) and (x, z) not in seen}
DROWNED_SET = {tuple(d) for d in DROWNED} | ISLANDS
ALLEY_SET = {tuple(a) for a in ALLEY}
def ground(tx, tz):
    c = code(tx, tz)
    if (tx, tz) in ALLEY_SET: return 'street'
    if c >= 6 and ((c - 6) in REPLACED or (c - 6) in BUILT): return 'street'
    if taken_away(c) or (tx, tz) in DROWNED_SET: return 'water'
    return 'water' if c == 0 else 'meadow' if c == 4 else 'gravel' if c == 5 else 'street'
LAKE = next(b for b in BARRIERS if b['lake'])
def centroid(b):
    cx = cz = n = 0
    for _, qq in b:
        for i in range(0, len(qq), 3): cx += qq[i]; cz += qq[i + 2]; n += 1
    return cx / n, cz / n
def shown(b):
    cx, cz = centroid(b)
    tx, tz = math.floor(cx), math.floor(cz); c = code(tx, tz)
    if c >= 6 and (c - 6) in REPLACED: return False
    north = cz < 62
    g = ground(tx, tz)
    if north and 0 <= tx < N and 0 <= tz < N and (g in ('water', 'meadow', 'gravel') or (tx, tz) in DROWNED_SET): return False
    return not (cx > LAKE['at'][0] and cz < LAKE['at'][1] + 6)

# footprints of the shown buildings: their roof polygons flat on the ground (LoD2 roofs have no overhang)
def rings_of(b):
    out = []
    for k, qq in b:
        if k != 'r': continue
        r = [(qq[i], qq[i + 2]) for i in range(0, len(qq), 3)]
        if len(r) >= 3: out.append(r)
    return out
SHOWN = [(i, b) for i, b in enumerate(LOD2) if shown(b)]
RINGS = []  # (id, xmin, xmax, zmin, zmax, ring)
for i, b in SHOWN:
    for r in rings_of(b):
        xs = [p[0] for p in r]; zs = [p[1] for p in r]
        if max(xs) < -2 or min(xs) > N + 2 or max(zs) < -2 or min(zs) > N + 2: continue
        RINGS.append((i, min(xs), max(xs), min(zs), max(zs), r))
def inside(px, pz, r):
    c = False
    for i in range(len(r)):
        x1, z1 = r[i]; x2, z2 = r[(i + 1) % len(r)]
        if (z1 > pz) != (z2 > pz) and px < x1 + (pz - z1) * (x2 - x1) / (z2 - z1): c = not c
    return c
def built_id(px, pz):
    for i, a, b_, c_, d, r in RINGS:
        if a <= px <= b_ and c_ <= pz <= d and inside(px, pz, r): return i
    return -1
def built(px, pz): return built_id(px, pz) >= 0
# wall feet (port of wallFeet): (x0,z0,x1,z1,nx,nz,id)
FEET = []
for i, b in SHOWN:
    cx, cz = centroid(b)
    for k, qq in b:
        if k != 'w': continue
        low = [(qq[j], qq[j + 2]) for j in range(0, len(qq), 3) if qq[j + 1] < 0.3]
        if len(low) < 2: continue
        (x0, z0), (x1, z1) = low[0], low[-1]
        L = math.hypot(x1 - x0, z1 - z0)
        if L < 0.3: continue
        nx, nz = -(z1 - z0) / L, (x1 - x0) / L
        if nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) < 0: nx, nz = -nx, -nz
        FEET.append((x0, z0, x1, z1, nx, nz, i))
def ray_feet(ox, oz, dx, dz, mx):
    """how far along (dx,dz) from (ox,oz) to the first wall foot; (t, id)"""
    best = (mx, -1)
    for x0, z0, x1, z1, nx, nz, i in FEET:
        ex, ez = x1 - x0, z1 - z0; den = dx * ez - dz * ex
        if abs(den) < 1e-9: continue
        t = ((x0 - ox) * ez - (z0 - oz) * ex) / den; u = ((x0 - ox) * dz - (z0 - oz) * dx) / den
        if t > 0 and -0.02 <= u <= 1.02 and t < best[0]: best = (t, i)
    return best


R = 8                     # cells per tile
IN = 0.8                  # how far in from the fronts a fence stands (tiles)
LEDGE = 2.0               # open ground up to this deep behind the plan's edge is a ledge before a front, no gap
MAX_GAP = 8.0             # wider than this is a square or a yard, not a gap between two houses
M = N * R

# ---- the cells: W walkable, B built, . open ground one could look over, X something else (lake, barrier street..)
cls = [[' '] * M for _ in range(M)]
for cz in range(M):
    for cx in range(M):
        tx, tz = cx // R, cz // R
        if rows[tz][tx] != '#': cls[cz][cx] = 'W'; continue
        c = code(tx, tz)
        if c >= 6 and (c - 6) in REPLACED: cls[cz][cx] = 'L'; continue
        if c in (0, 3, 4, 5) or ground(tx, tz) != 'street': cls[cz][cx] = 'X'; continue
        cls[cz][cx] = 'B' if built((cx + 0.5) / R, (cz + 0.5) / R) else '.'

# ---- the barriers, as drawn (no wider than the lane up to 1.6 tiles behind, or exactly from end to end)
def reach_from(b, ox, oz, sx):
    ax, az = -b['dir'][1], b['dir'][0]
    best = (b['half'] + 2, -1)
    for (x0, z0, x1, z1, nx, nz, i) in FEET:
        ex, ez = x1 - x0, z1 - z0; den = ax * sx * ez - az * sx * ex
        if abs(den) < 1e-6: continue
        t = ((x0 - ox) * ez - (z0 - oz) * ex) / den; u = ((x0 - ox) * az * sx - (z0 - oz) * ax * sx) / den
        if t > 0.2 and -0.02 <= u <= 1.02 and t < best[0]: best = (t, i)
    return best
def reach(b, sx):
    if b.get('ends'):
        ax, az = -b['dir'][1], b['dir'][0]
        ps = [(e[0] - b['at'][0]) * ax + (e[1] - b['at'][1]) * az for e in b['ends']]
        return (-min(ps) if sx < 0 else max(ps), -2)
    return min((reach_from(b, b['at'][0] + b['dir'][0] * k, b['at'][1] + b['dir'][1] * k, sx) for k in (0, 0.8, 1.6)), key=lambda h: h[0])
SPANS = [(b, reach(b, -1), reach(b, 1)) for b in BARRIERS]
for b, L, Rr in SPANS:
    for cz in range(M):
        for cx in range(M):
            if cls[cz][cx] != '.': continue
            dx, dz = (cx + 0.5) / R - b['at'][0], (cz + 0.5) / R - b['at'][1]
            d = dx * b['dir'][0] + dz * b['dir'][1]; l = -dx * b['dir'][1] + dz * b['dir'][0]
            if -0.3 < d < 8 and -L[0] - 0.3 <= l <= Rr[0] + 0.3: cls[cz][cx] = 'X'
print('== barriers')
for bi, (b, L, Rr) in enumerate(SPANS):
    ax, az = -b['dir'][1], b['dir'][0]
    x0, z0 = b['at'][0] - ax * L[0], b['at'][1] - az * L[0]; x1, z1 = b['at'][0] + ax * Rr[0], b['at'][1] + az * Rr[0]
    notes = []
    if L[1] == -1: notes.append('LEFT END REACHES NO WALL')
    if Rr[1] == -1: notes.append('RIGHT END REACHES NO WALL')
    # the lane before it: from the barrier into the town, how long the walkable cross-section (along the barrier's
    # axis) stays about as narrow as the barrier before it widens into the street
    W = L[0] + Rr[0]
    def walk(px, pz):
        cx, cz = int(px * R), int(pz * R)
        return 0 <= cx < M and 0 <= cz < M and cls[cz][cx] == 'W'
    def section(s):
        ox, oz = b['at'][0] - b['dir'][0] * s, b['at'][1] - b['dir'][1] * s
        mid = None
        for k in range(0, int((W + 1) * R)):
            for sg in (1, -1):
                if walk(ox + ax * sg * k / R, oz + az * sg * k / R): mid = sg * k / R; break
            if mid is not None: break
        if mid is None: return 0.0
        out = 0.0
        for sg in (1, -1):
            t = mid
            while walk(ox + ax * t, oz + az * t) and abs(t - mid) < 20: t += sg / R
            out += abs(t - mid)
        return out
    stretch, s_ = 0.0, 0.5
    while s_ < 8:
        sec = section(s_)
        if sec > W + 1.5 or sec == 0: break
        stretch = s_; s_ += 0.5
    notes.append('lane %.1f wide for %.1f tiles before it, then %.1f wide' % (section(0.5), stretch, section(s_)))
    print(' %d at (%.2f,%.2f) dir (%.3f,%.3f): drawn (%.1f,%.1f)-(%.1f,%.1f), %.1f wide, ends on bldg %d / %d; %s' % (bi, *b['at'], *b['dir'], x0, z0, x1, z1, W, L[1], Rr[1], '; '.join(notes)))

# ---- how deep into the open ground one gets from the plan (cells, 4-connected)
def flood():
    depth = {}; dq = deque()
    for cz in range(M):
        for cx in range(M):
            if cls[cz][cx] == 'W': depth[(cx, cz)] = 0; dq.append((cx, cz))
    while dq:
        cx, cz = dq.popleft()
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, nz = cx + dx, cz + dz
            if 0 <= nx < M and 0 <= nz < M and cls[nz][nx] == '.' and (nx, nz) not in depth:
                depth[(nx, nz)] = depth[(cx, cz)] + 1; dq.append((nx, nz))
    return depth
def hit_ring(ox, oz, dx, dz, mx):
    """how far from (ox,oz) along (dx,dz) to the first footprint edge; (t, id)"""
    best = (mx, -1)
    for (bi, a, b_, c_, d, r) in RINGS:
        if (dx > 0 and a > ox + mx) or (dx < 0 and b_ < ox - mx) or (dz > 0 and c_ > oz + mx) or (dz < 0 and d < oz - mx): continue
        for j in range(len(r)):
            x0, z0 = r[j]; x1, z1 = r[(j + 1) % len(r)]
            ex, ez = x1 - x0, z1 - z0; den = dx * ez - dz * ex
            if abs(den) < 1e-9: continue
            t = ((x0 - ox) * ez - (z0 - oz) * ex) / den; u = ((x0 - ox) * dz - (z0 - oz) * dx) / den
            if t > 0 and 0 <= u <= 1 and t < best[0]: best = (t, bi)
    return best
def hit_other(ox, oz, dx, dz, mx):
    """how far along (dx,dz) to a cell that is neither open ground nor walkable: the lake, a barrier's street, a lot
    built on its own (the AmannLabs); -3 for it"""
    t = 1 / R
    while t < mx:
        cx, cz = int((ox + dx * t) * R), int((oz + dz * t) * R)
        if not (0 <= cx < M and 0 <= cz < M) or cls[cz][cx] == 'L': return (t, -3)
        if cls[cz][cx] == 'X': return (t, -4)
        if cls[cz][cx] == 'B': return (mx, -1)
        t += 1 / R
    return (mx, -1)
def hit(ox, oz, dx, dz, mx):
    return min(hit_ring(ox, oz, dx, dz, mx), hit_other(ox, oz, dx, dz, mx), key=lambda h: h[0])
def chord(px, pz, ux, uz, mx):
    """the chord through (px,pz) along (ux,uz) from wall to wall (or to the edge of what is not open ground), or None"""
    if built(px, pz): return None
    a = hit(px, pz, -ux, -uz, mx); b_ = hit(px, pz, ux, uz, mx)
    if a[1] == -1 or b_[1] == -1: return None
    return (px - ux * a[0], pz - uz * a[0], px + ux * b_[0], pz + uz * b_[0], a[1], b_[1], a[0] + b_[0])
def crosses_walk(x0, z0, x1, z1):
    L = math.hypot(x1 - x0, z1 - z0); n = int(L * R * 3) + 1
    for k in range(n + 1):
        t = k / n; cx, cz = int((x0 + (x1 - x0) * t) * R), int((z0 + (z1 - z0) * t) * R)
        if 0 <= cx < M and 0 <= cz < M and cls[cz][cx] == 'W': return True
    return False
def mark(x0, z0, x1, z1, ch):
    # (a little past both ends, into the walls: no slit left at a corner)
    L = math.hypot(x1 - x0, z1 - z0); n = int(L * R * 3) + 1; e = 0.15 / L
    for k in range(n + 1):
        t = k / n * (1 + 2 * e) - e; cx, cz = int((x0 + (x1 - x0) * t) * R), int((z0 + (z1 - z0) * t) * R)
        if 0 <= cx < M and 0 <= cz < M and cls[cz][cx] == '.': cls[cz][cx] = ch

DEEP = int(LEDGE * R)
fences, left_open = [], []
print('== gaps: where the open ground in view goes deeper than a ledge of %.1f tiles' % LEDGE)
for round_ in range(3):
    depth = flood()
    # the entrances: the cells just beyond the ledge, in clusters
    entry = {k for k, d in depth.items() if d == DEEP}
    clusters = []
    while entry:
        s = entry.pop(); comp = [s]; st = [s]
        while st:
            cx, cz = st.pop()
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    nb = (cx + dx, cz + dz)
                    if nb in entry: entry.remove(nb); comp.append(nb); st.append(nb)
        clusters.append(comp)
    clusters.sort(key=lambda c: (sum(p[1] for p in c) / len(c), sum(p[0] for p in c) / len(c)))
    def goes_on(comp):
        seen = set(comp); st = list(comp)
        while st:
            cx, cz = st.pop()
            if depth[(cx, cz)] >= DEEP + R: return True
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nb = (cx + dx, cz + dz)
                if nb not in seen and depth.get(nb, -1) >= DEEP: seen.add(nb); st.append(nb)
        return False
    new = 0
    for comp in clusters:
        if not goes_on(comp): continue
        cx = sum(p[0] + 0.5 for p in comp) / len(comp) / R; cz = sum(p[1] + 0.5 for p in comp) / len(comp) / R
        # the way in: from the shallower neighbours toward the cluster
        gx = gz = 0.0
        for (px, pz) in comp:
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if depth.get((px + dx, pz + dz), 99) < DEEP: gx -= dx; gz -= dz
        gl = math.hypot(gx, gz)
        if gl < 1e-6: gx, gz = 0.0, 1.0
        else: gx, gz = gx / gl, gz / gl
        where = 'entrance at (%.1f,%.1f), %d cells, way in (%.2f,%.2f)' % (cx, cz, len(comp), gx, gz)
        # across the gap: the shortest chord through the entrance, about perpendicular to the way in
        best = None
        for deg in range(0, 180, 5):
            ux, uz = math.cos(math.radians(deg)), math.sin(math.radians(deg))
            if abs(ux * gx + uz * gz) > 0.75: continue
            c = chord(cx, cz, ux, uz, MAX_GAP)
            if c and (not best or c[6] < best[0][6]): best = (c, ux, uz)
        if not best:
            left_open.append(where + ': wider than %.0f tiles between walls, a square or a yard' % MAX_GAP); continue
        c0, ux, uz = best
        if c0[6] > MAX_GAP:
            left_open.append(where + ': %.1f tiles between bldg %d and %d, too wide for a fence' % (c0[6], c0[4], c0[5])); continue
        if c0[4] == c0[5] == -3:
            left_open.append(where + ': between no houses at all'); continue
        if -4 in (c0[4], c0[5]):
            left_open.append(where + ': beside the street behind a barrier, nothing to fence to'); continue
        if c0[4] == c0[5]:
            left_open.append(where + ': %.1f tiles across inside bldg %d alone (a notch of it)' % (c0[6], c0[4])); continue
        # back toward the street until the walls beside the gap end: there the fronts are; the fence IN tiles in
        wide = c0[6]; s = 0.0; front = None
        while s < LEDGE + 1.0:
            px, pz = cx - gx * s, cz - gz * s
            c = chord(px, pz, ux, uz, MAX_GAP)
            if not c or c[6] > wide + 1.0 or {c[4], c[5]} != {c0[4], c0[5]} or crosses_walk(*c[:4]): break
            front = s; s += 0.125
        if front is None:
            left_open.append(where + ': no straight way back to the street from it'); continue
        s = max(0.0, front - IN)
        c = chord(cx - gx * s, cz - gz * s, ux, uz, MAX_GAP)
        while c and crosses_walk(*c[:4]) and s > 0: s = max(0.0, s - 0.125); c = chord(cx - gx * s, cz - gz * s, ux, uz, MAX_GAP)
        if not c:
            left_open.append(where + ': no wall-to-wall line %.1f in' % IN); continue
        f = [round(c[0], 3), round(c[1], 3), round(c[2], 3), round(c[3], 3)]
        fences.append(f); mark(*f, 'F'); new += 1
        print(' fence (%.2f,%.2f)-(%.2f,%.2f) %.1f long, bldg %d|%d, %.1f in from the fronts, %s' % (c[0], c[1], c[2], c[3], c[6], c[4], c[5], front - s, where))
    if not new: break
    print(' -- %d fences in round %d; looking again behind them' % (new, round_ + 1))
print(len(fences), 'fences')
print('== left open (no fence):')
for s in left_open: print('  ' + s)
depth = flood()
deep = {k for k, d in depth.items() if d >= DEEP}
print('== open ground still in view deeper than %.1f tiles: %d cells' % (LEDGE, len(deep)))
left = set(deep); regions = []
while left:
    s0 = left.pop(); comp = [s0]; st = [s0]
    while st:
        cx, cz = st.pop()
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb = (cx + dx, cz + dz)
            if nb in left: left.remove(nb); comp.append(nb); st.append(nb)
    regions.append(comp)
for comp in sorted(regions, key=lambda c: -len(c))[:12]:
    ent = [p for p in comp if depth[p] == DEEP]
    ex = sum(p[0] + 0.5 for p in ent) / len(ent) / R; ez = sum(p[1] + 0.5 for p in ent) / len(ent) / R
    xs = [p[0] / R for p in comp]; zs = [p[1] / R for p in comp]
    print('  %d cells, x %.0f-%.0f z %.0f-%.0f, %.1f tiles deep, entered at (%.1f,%.1f) (%d cells)' % (len(comp), min(xs), max(xs), min(zs), max(zs), max(depth[p] for p in comp) / R, ex, ez, len(ent)))

# ---- overview: ' ' floor, a-z the real houses, o open ground not in view, : a ledge in view, ! open ground in view
# beyond a ledge, F fence, = barrier line, - street behind a barrier, ~ lake, , meadow/gravel, x other
x0, x1, z0, z1 = 0, 100, 30, 100
out = ['    ' + ''.join(str((x // 10) % 10) if x % 10 == 0 else ' ' for x in range(x0, x1)), '    ' + ''.join(str(x % 10) for x in range(x0, x1))]
for tz in range(z0, z1):
    line = ''
    for tx in range(x0, x1):
        cells = [(cx, cz) for cz in range(tz * R, tz * R + R) for cx in range(tx * R, tx * R + R)]
        kinds = [cls[cz][cx] for cx, cz in cells]
        if rows[tz][tx] != '#': ch = ' '
        elif 'F' in kinds: ch = 'F'
        elif any(-0.15 < ((tx + 0.5 - b['at'][0]) * b['dir'][0] + (tz + 0.5 - b['at'][1]) * b['dir'][1]) < 0.15 and -Lr[0] <= (-(tx + 0.5 - b['at'][0]) * b['dir'][1] + (tz + 0.5 - b['at'][1]) * b['dir'][0]) <= Rr_[0] for (b, Lr, Rr_) in SPANS): ch = '='
        else:
            dmax = max((depth.get(p, 0) for p in cells), default=0)
            if dmax >= DEEP: ch = '!'
            elif dmax > 0: ch = ':'
            elif code(tx, tz) == 0: ch = '~'
            elif code(tx, tz) == 3: ch = '-'
            elif code(tx, tz) in (4, 5): ch = ','
            elif '.' in kinds: ch = 'o'
            elif 'B' in kinds:
                i = built_id(tx + 0.5, tz + 0.5); ch = chr(97 + i % 26) if i >= 0 else '#'
            else: ch = 'x'
        line += ch
    out.append('%3d ' % tz + line)
print('\n'.join(out))
if '--zoom' in ARGS:
    k = ARGS.index('--zoom'); zx0, zx1, zz0, zz1 = [int(v) for v in ARGS[k + 1:k + 5]]
    print('     ' + ''.join(('%-4d' % x) for x in range(zx0, zx1)))
    for cz in range(zz0 * R, zz1 * R):
        line = ''
        for cx in range(zx0 * R, zx1 * R):
            c = cls[cz][cx]
            if c == 'B': i = built_id((cx + 0.5) / R, (cz + 0.5) / R); line += chr(65 + i % 26) if i >= 0 else 'B'
            elif c == '.': d = depth.get((cx, cz)); line += ('-' if d is None else str(min(9, d // 2)))
            elif c == 'W': line += ' '
            elif c == 'L': line += '#'
            else: line += c
        print('%5.2f %s' % (cz / R, line))
if WRITE:
    p = os.path.join(ROOT, 'src/render/waldsee-lod2.ts')
    src = open(p).read()
    src = re.sub(r"export const WALDSEE_FENCE_RUNS: number\[\]\[\] = \[.*?\];\n", 'export const WALDSEE_FENCE_RUNS: number[][] = ' + json.dumps(fences, separators=(',', ':')) + ';\n', src, flags=re.S)
    open(p, 'w').write(src)
    print('written', p)
