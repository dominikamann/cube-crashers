"""Writes the Bad Waldsee map into the game from grid2.json (see town.py): the floor with its markers
(src/sim/config/floor-waldsee.ts) and what the houses look like (src/sim/config/waldsee-town.ts)."""
import json, math, os
G=json.load(open('grid2.json')); N=len(G['rows'])
rows=[list(r) for r in G['rows']]; owner=G['owner']; H={h['id']:h for h in G['houses']}
P=G['pois']
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','src','sim','config')
d=lambda a,b: math.hypot(a[0]-b[0],a[1]-b[1])
def clear(x,z,r): return all(0<=x+ox<N and 0<=z+oz<N and rows[z+oz][x+ox]=='.' for ox in range(-r,r+1) for oz in range(-r,r+1))

# --- the roofs: a ridge along each house, falling to both sides, in steps of a fifth of a block
STEP=0.2
roof=[[0]*N for _ in range(N)]
for h in H.values():
    tiles=[(x,y) for y in range(N) for x in range(N) if owner[y][x]==h['id']]
    s,c=math.sin(h['ang']),math.cos(h['ang'])
    perp=lambda x,y: abs(-(x+0.5-h['cx'])*s+(y+0.5-h['cz'])*c)
    half=max(perp(x,y) for x,y in tiles)+0.5
    slope=0.5 if h['kind'] in('house','kornhaus','rathaus') else 0.4
    top=1.2 if h['kind']=='house' else 1.8
    for x,y in tiles: roof[y][x]=max(1,min(9,round(min(top,slope*(half-perp(x,y)))/STEP)))

# --- trees and fountains stand on the floor and are in the way (a low wall in the rules)
trees=[]
for x,y in P['T']:
    tx,ty=int(x),int(y)
    # (not the ones right in front of the Czardas: its terrace is there)
    if 92<=tx<=98 and 81<=ty<=84: continue
    if rows[ty][tx]=='.' and (tx,ty) not in trees: trees.append((tx,ty))
fountains=[]
for name,x,y in P['F']:
    tx,ty=int(x),int(y)
    if rows[ty][tx]!='.':
        # (drawn half on a house: the nearest floor)
        tx,ty=min(((ax,ay) for ay in range(N) for ax in range(N) if rows[ay][ax]=='.'),key=lambda p:d(p,(x,y)))
    fountains.append((name,tx,ty))
solid=set(trees)|{(x,y) for _,x,y in fountains}
for x,y in solid: rows[y][x]='='
# --- tables and chairs in front of the cafes and inns
cafes=[]
for name,kind,seats,x,y in P['named']:
    if not(seats=='yes' or name in('Czardas','Café am Markt','Café am Rathaus','Grüner Baum')): continue
    spots=sorted(((ax,ay) for ay in range(max(1,int(y)-5),min(N-1,int(y)+6)) for ax in range(max(1,int(x)-5),min(N-1,int(x)+6)) if rows[ay][ax]=='.' and any(rows[ay+oy][ax+ox]=='#' and owner[ay+oy][ax+ox]>=0 for ox,oy in((1,0),(-1,0),(0,1),(0,-1)))),key=lambda p:d(p,(x,y)))
    take=[]
    for p in spots:
        if len(take)>=(5 if name=='Czardas' else 3): break
        if all(d(p,q)>=1.5 for q in take): take.append(p)
    if name=='Czardas':
        # the Czardas on the Hochstatt: a whole terrace in front of the house, toward the fountain
        take=[p for p in ((93,82),(95,82),(97,82),(99,81),(99,79),(96,84)) if rows[p[1]][p[0]]=='.']
    if take: cafes.append((name,take))
tables={p for _,l in cafes for p in l}

# --- where the game puts things
F2=next((x,y) for n,x,y in fountains if 'Federle' in n)
S=min(((x,y) for y in range(N) for x in range(N) if clear(x,y,1) and 4<=d((x,y),F2)<=7 and (x,y) not in tables),key=lambda p:(abs(p[0]-(F2[0]-5))+abs(p[1]-(F2[1]+3))))
K=next((x,y) for n,x,y in fountains if 'Kornhaus' in n)
E=min(((x,y) for y in range(N) for x in range(N) if clear(x,y,1) and 3<=d((x,y),K)<=6),key=lambda p:d(p,(K[0]-3,K[1]+2)))
taken=[S,E]+list(solid)+list(tables)
OFF=[(-5,0),(5,0),(0,5),(0,-5),(-4,4),(4,-4),(4,4),(-4,-4)]
padsOf=lambda p: sum(1 for ox,oz in OFF if 0<p[0]+ox<N-1 and 0<p[1]+oz<N-1 and clear(p[0]+ox,p[1]+oz,1))
banned=set()
def pick(n,apart):
    nests=[]
    cn=[(x,z) for z in range(N) for x in range(N) if (x,z) not in banned and clear(x,z,1) and padsOf((x,z))>=3 and d((x,z),S)>=18 and d((x,z),E)>=9 and all(d((x,z),t)>=3 for t in solid)]
    while len(nests)<n and cn:
        p=max(cn,key=lambda q:d(q,S)) if not nests else max(cn,key=lambda q:min(d(q,m) for m in nests))
        if nests and min(d(p,m) for m in nests)<apart: break
        nests.append(p); cn=[q for q in cn if q!=p]
    return nests
def entries(nests,n):
    return sum(1 for z in range(1,N-1) for x in range(1,N-1) if 10.5<=d((x,z),n)<=13.5 and clear(x,z,1) and min(nests,key=lambda m:d((x,z),m))==n)
while True:
    nests=pick(8,19)
    bad=[n for n in nests if entries(nests,n)<4]
    if not bad: break
    banned.update(bad)
taken+=nests
cand=[(x,z) for z in range(N) for x in range(N) if clear(x,z,1) and all(d((x,z),t)>=2 for t in taken)]
ways=[min(cand,key=lambda p:d(p,S))]
while len(ways)<34: ways.append(max(cand,key=lambda p:min(d(p,w) for w in ways)))
taken+=ways
def spread(n,apart,away,key):
    out=[]
    for p in sorted((p for p in cand if all(d(p,t)>=away for t in taken)),key=key):
        if len(out)>=n: break
        if all(d(p,o)>=apart for o in out): out.append(p)
    taken.extend(out); return out
crates=spread(9,16,3,lambda p:(p[0]*7+p[1]*13)%97)
powers=spread(9,16,3,lambda p:(p[0]*11+p[1]*5)%89)
karts=spread(4,20,3,lambda p:d(p,S))

fmt=lambda l: ', '.join('[%d, %d]'%tuple(p) for p in l)
B36='0123456789abcdefghijklmnopqrstuvwxyz'
enc=lambda v: B36[v//36]+B36[v%36]
with open(os.path.join(OUT,'floor-waldsee.ts'),'w') as f:
    f.write('''import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * "Bad Waldsee": the heart of the old town as it stands. The Hochstatt with the Federle-Brunnen and its trees in
 * the south-east, the Rathaus, the Kornhaus with its fountain, the church of St. Peter in the north-west and the
 * Stadtsee beyond the houses. One can walk where the streets, lanes and squares are; north is up, and one tile
 * is about 2.9 metres. Made by tools/waldsee from OpenStreetMap (© OpenStreetMap contributors, ODbL); what the
 * houses look like is in waldsee-town.ts.
 */
const BASE = [
%s
];
const b = new GridBuilder(%d, %d);
BASE.forEach((row, z) => [...row].forEach((ch, x) => (b.grid[z][x] = ch)));

b.put('S', [%d, %d]).put('E', [%d, %d]);
b.put('N', %s);
b.put('V', %s);
b.put('*', %s);
b.put('c', %s);
b.put('w', %s);
b.autoNestSurroundings();

export const floorWaldseeRows = b.rows();
export const floorWaldsee = parseMap('waldsee', floorWaldseeRows);
''' % ('\n'.join("  '%s'," % ''.join(r) for r in rows), N, N, S[0],S[1],E[0],E[1], fmt(nests), fmt(karts), fmt(powers), fmt(crates), fmt(ways)))
with open(os.path.join(OUT,'waldsee-town.ts'),'w') as f:
    f.write('''/**
 * What stands where in Bad Waldsee (see floor-waldsee.ts): which house every wall tile belongs to, and how each
 * house looks. Made by tools/waldsee from OpenStreetMap (© OpenStreetMap contributors, ODbL); the colours of the
 * houses known from photos are theirs, the others are in the old town's range of plaster tones.
 */
export interface WaldseeHouse {
  /** 'house', or one of the landmarks, which get a model of their own on top */
  kind: 'house' | 'rathaus' | 'kornhaus' | 'church' | 'tower' | 'castle';
  name: string;
  /** plaster and roof tiles (rrggbb) */
  col: string;
  roof: string;
  /** how high the walls are, in blocks */
  wall: number;
  /** the middle of the house (tiles) and the direction its ridge runs in (radians from +x toward +z) */
  cx: number;
  cz: number;
  ang: number;
}

/** per tile, two characters (base 36): 00 the lake, 01 a garden, 02 nothing (floor, or the rim), from 03 on house number + 3 */
export const WALDSEE_TILES: string[] = [
%s
];
/** per tile, how high the roof stands over the walls there, in fifths of a block (0: no roof) */
export const WALDSEE_ROOFS: string[] = [
%s
];
export const WALDSEE_HOUSES: WaldseeHouse[] = [
%s
];
/** trees (those on the squares have a bench round the trunk), fountains, and the tables in front of cafes and inns (tiles) */
export const WALDSEE_TREES: [number, number][] = [%s];
export const WALDSEE_FOUNTAINS: { name: string; at: [number, number] }[] = [%s];
export const WALDSEE_TABLES: { name: string; at: [number, number][] }[] = [
%s
];
''' % ('\n'.join("  '%s'," % ''.join(enc(o+3) for o in r) for r in owner),
       '\n'.join("  '%s'," % ''.join(str(v) for v in r) for r in roof),
       '\n'.join("  { kind: '%s', name: %s, col: '%s', roof: '%s', wall: %s, cx: %s, cz: %s, ang: %s }," % (h['kind'], json.dumps(h['name'],ensure_ascii=False), h['col'], h['roof'], h['wall'], h['cx'], h['cz'], h['ang']) for h in (H[i] for i in sorted(H))),
       fmt(trees), ', '.join("{ name: %s, at: [%d, %d] }" % (json.dumps(n,ensure_ascii=False),x,y) for n,x,y in fountains),
       '\n'.join("  { name: %s, at: [%s] }," % (json.dumps(n,ensure_ascii=False), fmt(l)) for n,l in cafes)))
print('S',S,'E',E,'nests',nests,'trees',len(trees),'cafes',[(n,len(l)) for n,l in cafes])
