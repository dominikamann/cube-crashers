"""The buildings of the Town in 3D, from the LoD2 building models of Baden-Wuerttemberg (LGL, www.lgl-bw.de,
dl-de/by-2-0): walls and roofs as the polygons they are, in the Town's tile coordinates, heights in tiles above
each building's own ground. Writes src/render/waldsee-lod2.ts.
usage: python3 -I lod2.py <folder with the LoD2_32_*.gml files>"""
import sys, os, math, glob, json
import xml.etree.ElementTree as ET
folder = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'render', 'waldsee-lod2.ts')
# the Town's tiles (see town.py)
LAT0, LON0, M, N = 47.91968, 9.75590, 1.6, 128
mx = 111320 * math.cos(math.radians(LAT0)); my = 110540
def tile(lat, lon): return ((lon - LON0) * mx / M + N / 2, N / 2 - (lat - LAT0) * my / M)

def utm_to_latlon(E, Nn, zone=32):
    # inverse transverse Mercator on GRS80
    a = 6378137.0; f = 1 / 298.257222101; k0 = 0.9996
    e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    x = E - 500000.0; y = Nn
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu) + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu)
    n1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    t1 = math.tan(phi1) ** 2; c1 = ep2 * math.cos(phi1) ** 2
    r1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6 / 720)
    lon = (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5 / 120) / math.cos(phi1)
    return math.degrees(lat), (zone - 1) * 6 - 180 + 3 + math.degrees(lon)

NS = {'gml': 'http://www.opengis.net/gml', 'bldg': 'http://www.opengis.net/citygml/building/1.0'}
KIND = {'RoofSurface': 'r', 'WallSurface': 'w', 'GroundSurface': 'g', 'ClosureSurface': 'w'}
buildings = []
footprints = []
for path in sorted(glob.glob(os.path.join(folder, 'LoD2_32_*.gml'))):
    for ev, el in ET.iterparse(path, events=('end',)):
        if el.tag != '{%s}Building' % NS['bldg']: continue
        polys = []
        for bb in el.iter('{%s}boundedBy' % NS['bldg']):
            for surf in bb:
                k = KIND.get(surf.tag.split('}')[1])
                if not k: continue
                for pl in surf.iter('{%s}posList' % NS['gml']):
                    v = [float(t) for t in pl.text.split()]
                    polys.append((k, [(v[i], v[i + 1], v[i + 2]) for i in range(0, len(v), 3)]))
        el.clear()
        if not polys: continue
        # (quick reject far from the Town before converting every point)
        e0, n0 = polys[0][1][0][0], polys[0][1][0][1]
        la, lo = utm_to_latlon(e0, n0)
        tx, tz = tile(la, lo)
        # (the buildings round the Town too, as far as one sees down its streets: a backdrop nobody reaches)
        if not (-130 < tx < N + 130 and -130 < tz < N + 130): continue
        ground = min(p[2] for _, pts in polys for p in pts)
        foot = []
        out = []
        inside = False
        for k, pts in polys:
            q = []
            for E, Nn, Z in pts[:-1] if pts[0] == pts[-1] else pts:
                la, lo = utm_to_latlon(E, Nn)
                x, z = tile(la, lo)
                inside |= -100 < x < N + 100 and -100 < z < N + 100
                q += [round(x, 2), round((Z - ground) / M, 2), round(z, 2)]
            if k == 'g': foot.append([v for i, v in enumerate(q) if i % 3 != 1])
            else: out.append([k, q])
        if inside: buildings.append(out); footprints.append(foot)
# the addresses of the buildings, from the house coordinates of Baden-Wuerttemberg (ALKIS, LGL, dl-de/by-2-0):
# hk.csv holds street;number;suffix;east;north for the streets round the Hochstatt (made with grep, see README)
addr = [[] for _ in buildings]
def ring_in(px, pz, ring):
    c = False
    for i in range(0, len(ring), 2):
        x1, z1 = ring[i], ring[i + 1]; x2, z2 = ring[(i + 2) % len(ring)], ring[(i + 3) % len(ring)]
        if (z1 > pz) != (z2 > pz) and px < x1 + (pz - z1) * (x2 - x1) / (z2 - z1): c = not c
    return c
hk = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hk.csv')
if os.path.exists(hk):
    for line in open(hk, encoding='utf-8'):
        street, num, suffix, east, north = line.strip().split(';')
        x, z = tile(*utm_to_latlon(float(east), float(north)))
        for i, f in enumerate(footprints):
            if any(ring_in(x, z, r) for r in f): addr[i].append(street + ' ' + num + suffix); break
print(len(buildings), 'buildings in the Town,', sum(1 for a in addr if a), 'with an address')
with open(OUT, 'w') as f:
    f.write('/**\n * The buildings of the Town in 3D: walls and roofs as polygons ([x, y, z] in tiles, y above the building\'s own\n * ground). From the LoD2 building models of Baden-Wuerttemberg, (c) LGL, www.lgl-bw.de, dl-de/by-2-0; made by\n * tools/waldsee/lod2.py.\n */\n')
    f.write('export const WALDSEE_LOD2: [kind: "r" | "w", points: number[]][][] = ')
    f.write(json.dumps(buildings, separators=(',', ':')))
    # the lake round the Town, from OpenStreetMap (the Stadtsee): its outline in tiles
    lakes = []
    osm = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'osm2.json')
    if os.path.exists(osm):
        d = json.load(open(osm))
        nodes = {e['id']: (e['lat'], e['lon']) for e in d['elements'] if e['type'] == 'node'}
        for e in d['elements']:
            if e['type'] == 'way' and e.get('tags', {}).get('natural') == 'water':
                ring = []
                for nid in e['nodes']:
                    if nid in nodes: ring += [round(c, 2) for c in tile(*nodes[nid])]
                if len(ring) > 6: lakes.append(ring)
    f.write(';\n/** the lake round the Town (outlines in tiles, from OpenStreetMap, (c) OpenStreetMap contributors, ODbL) */\nexport const WALDSEE_LAKES: number[][] = ')
    f.write(json.dumps(lakes, separators=(',', ':')))
    f.write(';\n/** the addresses of each building (from the house coordinates, ALKIS, (c) LGL, dl-de/by-2-0) */\nexport const WALDSEE_LOD2_ADDRESSES: string[][] = ')
    f.write(json.dumps(addr, ensure_ascii=False, separators=(',', ':')))
    f.write(';\n')
print(os.path.getsize(OUT), 'bytes')

# the game's walls follow the real buildings: a floor tile that a building covers for the most part becomes wall
# (the streets, the barriers and the open ways stay as town.py drew them; the floor is never widened here)
import re
FLOOR = os.path.join(os.path.dirname(OUT), '..', 'sim', 'config', 'floor-waldsee.ts')
src = open(FLOOR).read()
rows = [list(r) for r in re.findall(r"^  '([#.=]{%d})',$" % N, src, re.M)]
orig = [''.join(r) for r in rows]
def inside(px, pz, ring):
    c = False
    for i in range(0, len(ring), 2):
        x1, z1 = ring[i], ring[i + 1]; x2, z2 = ring[(i + 2) % len(ring)], ring[(i + 3) % len(ring)]
        if (z1 > pz) != (z2 > pz) and px < x1 + (pz - z1) * (x2 - x1) / (z2 - z1): c = not c
    return c
covered = 0
for z in range(1, N - 1):
    for x in range(1, N - 1):
        if rows[z][x] == '#': continue
        hits = sum(1 for a in (0.2, 0.5, 0.8) for b in (0.2, 0.5, 0.8) if any(inside(x + a, z + b, r) for f in footprints for r in f))
        if hits >= 5: rows[z][x] = '#'; covered += 1
# and the other way: a wall tile right at the street where no real building stands (a ledge before a front that
# lies further back) becomes floor, one tile deep, so the walls one bumps into are the walls one sees. (Not behind
# a barrier, not the lake, the meadow or the gravel: those are kept by their codes in waldsee-town.ts)
TOWN = os.path.join(os.path.dirname(OUT), '..', 'sim', 'config', 'waldsee-town.ts')
codes = re.findall(r"^  '([0-9a-z]{%d})',$" % (2 * N), open(TOWN).read(), re.M)[:N]
code = lambda x, z: int(codes[z][2 * x:2 * x + 2], 36)
opened = []
for z in range(2, N - 2):
    for x in range(2, N - 2):
        if rows[z][x] != '#' or code(x, z) in (0, 3, 4, 5): continue
        if not any(rows[z + b][x + a] == '.' for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))): continue
        hits = sum(1 for a in (0.2, 0.5, 0.8) for b in (0.2, 0.5, 0.8) if any(inside(x + a, z + b, r) for f in footprints for r in f))
        if hits == 0: opened.append((x, z))
for x, z in opened: rows[z][x] = '.'
print(len(opened), 'wall tiles before fronts that stand further back made floor')
# (the rows written back by their place: two rows may be alike)
start = src.index("const BASE = [\n") + len("const BASE = [\n"); end = src.index("];", start)
src = src[:start] + ''.join("  '" + ''.join(r) + "',\n" for r in rows) + src[end:]
open(FLOOR, 'w').write(src)
print(covered, 'floor tiles under real buildings made wall')
# markers that now stand on a wall
for name, pts in re.findall(r"b\.put\('(.)', (.*?)\);", src):
    for a, b in re.findall(r"\[(\d+), (\d+)\]", pts):
        if rows[int(b)][int(a)] == '#': print('marker', name, a, b, 'now on a wall')
