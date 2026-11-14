"""Writes the Town into the game from grid2.json (see town.py): the floor with its markers
(src/sim/config/floor-waldsee.ts) and what stands on it and how it looks (src/sim/config/waldsee-town.ts)."""
import json, math, os
G=json.load(open('grid2.json')); N=len(G['rows']); MK=G['marks']
rows=[list(r) for r in G['rows']]; owner=G['owner']; H={h['id']:h for h in G['houses']}
P=G['pois']
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','src','sim','config')
d=lambda a,b: math.hypot(a[0]-b[0],a[1]-b[1])
def clear(x,z,r): return all(0<=x+ox<N and 0<=z+oz<N and rows[z+oz][x+ox]=='.' for ox in range(-r,r+1) for oz in range(-r,r+1))
WATER,STREET,MEADOW,GRAVEL=-3,-4,-5,-6

# --- the roofs: a ridge along each house, falling to both sides, in steps of a fifth of a block
STEP=0.2
roof=[[0]*N for _ in range(N)]
for h in H.values():
    tiles=[(x,y) for y in range(N) for x in range(N) if owner[y][x]==h['id']]
    s,c=math.sin(h['ang']),math.cos(h['ang'])
    perp=lambda x,y: abs(-(x+0.5-h['cx'])*s+(y+0.5-h['cz'])*c)
    half=max(perp(x,y) for x,y in tiles)+0.5
    for x,y in tiles: roof[y][x]=max(1,min(9,round(min(1.8,0.5*(half-perp(x,y)))/STEP)))

# --- the face of a house nearest to a spot: the run of its tiles along one side that have open floor before them.
# Returns the middle of that run on the wall line, the way it faces, how long it is, and the house.
def face(spot, skip=(), only=None, most=6, beyond=False, want=None):
    # (`want`: only a front that looks this way)
    # (`beyond`: a front on the street painted on behind a barrier counts too: one sees it from the map)
    openAt=lambda x,y: rows[y][x]=='.' or (beyond and owner[y][x]==STREET)
    best=None
    for y in range(1,N-1):
        for x in range(1,N-1):
            o=owner[y][x]
            if o<0 or o in skip or (only is not None and o!=only): continue
            for dx,dz in ((0,1),(0,-1),(1,0),(-1,0)):
                if want and (dx,dz)!=want: continue
                if not openAt(x+dx,y+dz): continue
                dd=d((x+0.5+dx*0.5,y+0.5+dz*0.5),spot)
                if not best or dd<best[0]: best=(dd,x,y,dx,dz,o)
    _,x,y,dx,dz,o=best
    # along the wall, as far as the same house stands with floor before it
    ax,az=(1,0) if dx==0 else (0,1)
    # (houses stand wall to wall here: the row of fronts counts, up to `most` tiles, not one house's alone)
    a=b=0
    wall=lambda k: owner[y+az*k][x+ax*k]>=0 and owner[y+az*k][x+ax*k] not in skip and openAt(x+ax*k+dx,y+az*k+dz)
    while b-a+1<most and (wall(a-1) or wall(b+1)):
        if wall(a-1): a-=1
        if b-a+1<most and wall(b+1): b+=1
    mid=(a+b)/2
    return {'x':round(x+0.5+ax*mid+dx*0.5,2),'z':round(y+0.5+az*mid+dz*0.5,2),'dx':dx,'dz':dz,'len':b-a+1,'house':o}

# --- the Czardas: its front toward the square, and the terrace before it
# (its front is the longest row of house fronts looking south onto the square within a few steps of it, up to
# seven tiles: the houses stand wall to wall there)
runs=[]
for y in range(1,N-1):
    x=1
    while x<N-1:
        if owner[y][x]>=0 and rows[y+1][x]=='.':
            x0=x
            while x<N-1 and owner[y][x]>=0 and rows[y+1][x]=='.': x+=1
            runs.append((x0,x-1,y))
        else: x+=1
# (the Czardas is the corner house where the Hauptstrasse leaves the square: its front is the row of fronts
# looking south nearest to it; a second door is on its side toward the Hauptstrasse)
r=min(runs,key=lambda r:d((min(max(MK['czardas'][0],r[0]),r[1]+1),r[2]+1),MK['czardas']))
x0,x1=r[0],r[1]
if x1-x0+1>4:
    m=min(max(int(MK['czardas'][0])-2,x0),x1-3); x0,x1=m,m+3
cz={'x':(x0+x1+1)/2,'z':r[2]+1,'dx':0,'dz':1,'len':x1-x0+1,'house':owner[r[2]][(x0+x1)//2]}
# its side door: the nearest house front looking east or west within a few steps of the front
sides=[(x,y,dx) for y in range(1,N-1) for x in range(1,N-1) for dx in (1,-1) if owner[y][x]>=0 and rows[y][x+dx]=='.' and d((x,y),(cz['x'],cz['z']))<=5]
sd=min(sides,key=lambda p:d((p[0],p[1]),(cz['x'],cz['z']-2))) if sides else None
czSide={'x':sd[0]+0.5+sd[2]*0.5,'z':sd[1]+0.5,'dx':sd[2],'dz':0,'len':1} if sd else None
FX0,FX1,FZ=int(cz['x']-cz['len']/2),int(cz['x']+cz['len']/2),int(cz['z'])
TERRACE=(FX0-4,FX1+3,FZ,FZ+7)
inTerrace=lambda x,y,m=0: TERRACE[0]-m<=x<=TERRACE[1]+m and TERRACE[2]-m<=y<=TERRACE[3]+m

# --- the Federle-Brunnen: a long basin of granite with a round block at one end; two tiles in the way
FED=(int(MK['federle'][0]),int(MK['federle'][1]))
if rows[FED[1]][FED[0]]!='.' or rows[FED[1]][FED[0]+1]!='.':
    FED=min(((x,y) for y in range(2,N-2) for x in range(2,N-3) if clear(x,y,1) and clear(x+1,y,1)),key=lambda p:d(p,MK['federle']))
# (no tree stands at the fountain: where one does, the fountain is a few steps further west)
treeT=[(int(x),int(y)) for x,y in P['T']]
while any(d((FED[0]+0.5,FED[1]),t)<3.2 for t in treeT) and rows[FED[1]][FED[0]-1]=='.' and clear(FED[0]-1,FED[1],1): FED=(FED[0]-1,FED[1])
fountain=[FED,(FED[0]+1,FED[1])]
# --- trees, each with a bench round it: where they stand, but not on the terrace and not at the fountain
trees=[]
for x,y in P['T']:
    tx,ty=int(x),int(y)
    # (every tree that stands there, where it stands; only the fountain's own two tiles are kept free)
    if rows[ty][tx]!='.' or (tx,ty) in ((FED[0],FED[1]),(FED[0]+1,FED[1])) or (tx,ty) in trees: continue
    trees.append((tx,ty))
# --- the police car in front of the station, on the street between it and the Czardas
pm=(MK['police'][0]*0.75+MK['czardas'][0]*0.25, MK['police'][1]*0.75+MK['czardas'][1]*0.25)
POLICE=min(((x,y) for y in range(2,N-4) for x in range(2,N-2) if all(rows[y+k][x+o]=='.' for k in (-1,0,1,2) for o in (-1,0,1)) and not inTerrace(x,y,1)),key=lambda p:d(p,pm))
cars=[POLICE]
solid=set(trees)|set(fountain)|{(x,y+k) for x,y in cars for k in (0,1)}
for x,y in solid: rows[y][x]='='

# --- tables: the terrace of the Czardas, the beer garden of the Hasen, a few in front of the ice-cream parlour
def spots(at,n,apart,reach,ok=lambda p:True):
    out=[]
    for p in sorted(((x,y) for y in range(2,N-2) for x in range(2,N-2) if rows[y][x]=='.' and d((x,y),at)<=reach and ok((x,y)) and all(d((x,y),s)>=1.5 for s in solid)),key=lambda p:d(p,at)):
        if len(out)>=n: break
        if all(d(p,o)>=apart for o in out): out.append(p)
    return out
tablesCz=[(x,FZ+r) for r in (1,4) for x in range(FX0-4,FX1+3,3) if rows[FZ+r][x]=='.' and all(d((x,FZ+r),q)>=2 for q in solid)][:8]
hasenFace=face(MK['hasen'],beyond=True)
garden=[]
# (the ice-cream parlour looks west onto the Hauptstrasse, like the police next to it)
eisFace=face(MK['eis'],want=(-1,0))
# (in front of its awning)
tablesEis=spots((eisFace['x']+eisFace['dx']*2.6,eisFace['z']+eisFace['dz']*2.6),4,1.8,4)
nemoFace=face(MK['memo'],skip=(face(MK['amadeus'])['house'],))
tablesNemo=spots((nemoFace['x']+nemoFace['dx']*2,nemoFace['z']+nemoFace['dz']*2),3,1.8,4)
tables={'Czardas':tablesCz,'Eisdiele':tablesEis}
allTables={p for l in tables.values() for p in l}

# --- signs over doors, and the shop of AmannLabs by the fountain: a big window with robots in it
# (where the travel agency is today, on the north side of the square)
amann=face(MK['reise'],skip=(cz['house'],),most=5)
signs=[
 {'text':'Eisdiele','kind':'eis',**eisFace},
 {'text':'Amadeus','kind':'amadeus',**face(MK['amadeus'])},
 {'text':'Hasen','kind':'hasen',**hasenFace},
 {'text':'Polizei','kind':'police',**face(MK['police'],skip=(cz['house'],))},
 {'text':'AmannLabs','kind':'amannlabs',**amann},
 # the kebab shop down the Ravensburger Strasse, and the little shop at the west end of the square
 {'text':'Memo','kind':'nemo',**nemoFace},
 # (on the west side of the Ravensburger Strasse, between the two ways down to the bank; the bank is seen
 # behind the barrier of the upper one, over its hedge)
 {'text':'Lädele','kind':'shop',**face(MK['shop'],want=(1,0))},
 {'text':'Bank','kind':'bank',**face(MK['bank'],beyond=True)},
]

# --- the houses one knows, as they look (from photos): plaster and shutters
def paint(house,col,shut=None,wall=None):
    H[house]['col']=col
    if shut: H[house]['shut']=shut
    if wall: H[house]['wall']=wall
paint(cz['house'],'6f93c9','b3262b',6.2)                                  # the Czardas: blue, red shutters
paint(face(MK['police'],skip=(cz['house'],))['house'],'f3f1ec','2f4a3a',6.0)  # the police: white, dark green shutters
paint(eisFace['house'],'e6e4dc',None,5.6)                                  # the ice-cream parlour: pale grey
# west of the Czardas along the north side of the square: the narrow white house with teal shutters behind the
# fountain, then the tall yellow one
north=[]
x=int(cz['x'])-int(cz['len']/2)-1; y=int(cz['z'])-1
for k in range(40):
    fx=x-k
    col=[yy for yy in range(y-6,y+7) if 0<fx<N and owner[yy][fx]>=0 and rows[yy+1][fx]=='.']
    if col:
        o=owner[max(col)][fx]
        if o!=cz['house'] and o not in north: north.append(o)
if len(north)>0: paint(north[0],'f4f1ea','2f8f7f',5.4)
if len(north)>1: paint(north[1],'f1dc7a','f4f1ea',6.4)
if len(north)>2: paint(north[2],'eeeeea',None,5.8)

# --- where the game puts things. In at the Wurzacher Tor, out by the elevator down at the bank. The witch dances
# round her fire beside the Federle-Brunnen
floorT=[(x,y) for y in range(2,N-2) for x in range(2,N-2) if clear(x,y,1) and (x,y) not in allTables and all(d((x,y),s)>=2 for s in solid)]
# in from the east, at the barrier of the Wurzacher Strasse; out by the elevator at the kebab shop, at the other end
gateB=max((b for b in G['barriers'] if not b['lake']),key=lambda b:b['at'][0]); bankB=max(G['barriers'],key=lambda b:b['at'][1])
S=min(floorT,key=lambda p:d(p,(gateB['at'][0]-gateB['dir'][0]*6,gateB['at'][1]-gateB['dir'][1]*6)))
E=min(floorT,key=lambda p:d(p,(bankB['at'][0]-bankB['dir'][0]*4,bankB['at'][1]-bankB['dir'][1]*4)))
FIRE=min((p for p in floorT if clear(p[0],p[1],3) and not inTerrace(p[0],p[1],2)),key=lambda p:d(p,(FED[0]+0.5,FED[1]+6)))
taken=[S,E,FIRE]+list(solid)+list(allTables)
cand=[p for p in floorT if all(d(p,t)>=2 for t in taken)]
ways=[min(cand,key=lambda p:d(p,S))]
while len(ways)<26: ways.append(max(cand,key=lambda p:min(d(p,w) for w in ways)))
taken+=ways
def spread(n,apart,away,key):
    out=[]
    for p in sorted((p for p in cand if all(d(p,t)>=away for t in taken)),key=key):
        if len(out)>=n: break
        if all(d(p,o)>=apart for o in out): out.append(p)
    taken.extend(out); return out
crates=spread(5,18,3,lambda p:(p[0]*7+p[1]*13)%97)
powers=spread(7,14,3,lambda p:(p[0]*11+p[1]*5)%89)

# --- the lake behind the police lane: where the pedal boat floats
lakeT=[(x,y) for y in range(N) for x in range(N) if owner[y][x]==WATER]
lakeB=next((b for b in G['barriers'] if b['lake']),None)
boat=None
if lakeT and lakeB:
    # out on the water, straight on from the lane, so one sees it looking down the lane
    boat=min(lakeT,key=lambda p:d(p,(lakeB['at'][0]+lakeB['dir'][0]*17,lakeB['at'][1]+lakeB['dir'][1]*17+1.5)))

lakeB0=next((b for b in G['barriers'] if b['lake']),None); lakeB_x,lakeB_z=(lakeB0['at'] if lakeB0 else (N,N))
meadowT=[(x,y) for y in range(2,N-2) for x in range(2,N-2) if owner[y][x]==MEADOW]
# (few on the near meadow, and none where one looks down the lane onto the water)
shore=[p for p in meadowT if (p[0]*7919+p[1]*104729)%(9 if p[0]>lakeB_x+30 else 37)==0 and abs(p[1]-lakeB_z)>3 and all(owner[p[1]+b][p[0]+a]==MEADOW for a in (-1,0,1) for b in (-1,0,1))]
fmt=lambda l: ', '.join('[%d, %d]'%tuple(p) for p in l)
B36='0123456789abcdefghijklmnopqrstuvwxyz'
enc=lambda v: B36[v//36]+B36[v%36]
js=lambda v: json.dumps(v,ensure_ascii=False)
with open(os.path.join(OUT,'floor-waldsee.ts'),'w') as f:
    f.write('''import { GridBuilder } from '../map/builder';
import { parseMap } from '../map/tilemap';

/**
 * "The Town": the Hochstatt of Bad Waldsee with the Czardas and the Federle-Brunnen, and the round one can walk
 * from it: down the Hauptstrasse to the Wurzacher Strasse (east to the Wurzacher Tor), by the ice-cream parlour
 * round the corner past the Amadeus and up the Ravensburger Strasse back to the trees, once round the Czardas by
 * the Hasengasse, and west down to the bank. Every other way out ends at a barrier. North is up; one tile is
 * about 2.2 metres. A boss floor: the witch dances round her fire beside the fountain. No karts, no build pads.
 * Made by tools/waldsee from OpenStreetMap (© OpenStreetMap contributors, ODbL); what stands on it and how the
 * houses look is in waldsee-town.ts.
 */
const BASE = [
%s
];
const b = new GridBuilder(%d, %d);
BASE.forEach((row, z) => [...row].forEach((ch, x) => (b.grid[z][x] = ch)));

b.put('S', [%d, %d]).put('E', [%d, %d]);
b.put('*', %s);
b.put('c', %s);
b.put('w', %s);

/** where the witch's fire burns, beside the Federle-Brunnen: she appears there */
export const WALDSEE_FIRE = { x: %d.5, z: %d.5 };
export const floorWaldseeRows = b.rows();
export const floorWaldsee = parseMap('waldsee', floorWaldseeRows);
''' % ('\n'.join("  '%s'," % ''.join(r) for r in rows), N, N, S[0],S[1],E[0],E[1], fmt(powers), fmt(crates), fmt(ways), FIRE[0], FIRE[1]))
with open(os.path.join(OUT,'waldsee-town.ts'),'w') as f:
    f.write('''/**
 * What stands where in the Town (see floor-waldsee.ts): which house every wall tile belongs to, how each house
 * looks, and the things one knows the place by. Made by tools/waldsee from OpenStreetMap (© OpenStreetMap
 * contributors, ODbL); the colours of the houses are in the old town's range of plaster tones.
 */
export interface WaldseeHouse {
  kind: 'house';
  name: string;
  /** plaster and roof tiles (rrggbb) */
  col: string;
  roof: string;
  /** how high the walls are, in blocks */
  wall: number;
  /** the colour of its shutters, where it is known (rrggbb) */
  shut?: string;
  /** the middle of the house (tiles) and the direction its ridge runs in (radians from +x toward +z) */
  cx: number;
  cz: number;
  ang: number;
}
/** a place on the face of a house: the middle of it on the wall line, the way it faces, how many tiles long it is */
export interface WaldseeFace {
  x: number;
  z: number;
  dx: number;
  dz: number;
  len: number;
}

/**
 * per tile, two characters (base 36): 00 the lake, 01 a walled yard, 02 nothing (floor), 03 the street painted
 * on behind a barrier, 04 meadow, 05 gravel, from 06 on house number + 6
 */
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
/** trees with a bench round the trunk (tiles) */
export const WALDSEE_TREES: [number, number][] = [%s];
/** the Federle-Brunnen: its two tiles, the basin on the first and the round block on the second */
export const WALDSEE_FOUNTAIN: [number, number][] = [%s];
/** parked cars, each two tiles long from its tile southward: the police car in front of the station */
export const WALDSEE_CARS: { kind: 'police'; at: [number, number] }[] = [%s];
/** tables: the terrace of the Czardas, the beer garden of the Hasen, in front of the ice-cream parlour */
export const WALDSEE_TABLES: { name: string; at: [number, number][] }[] = [
%s
];
/** the front of the Czardas toward the square */
export const WALDSEE_CZARDAS: WaldseeFace = %s;
/** the second door of the Czardas, on its side toward the Hauptstrasse (if there is one) */
export const WALDSEE_CZARDAS_SIDE: WaldseeFace | null = %s;
/** names over doors; 'amannlabs' is the shop by the fountain with robots behind its glass */
export const WALDSEE_SIGNS: (WaldseeFace & { text: string; kind: 'eis' | 'amadeus' | 'hasen' | 'police' | 'amannlabs' | 'shop' | 'nemo' | 'bank' })[] = [
%s
];
/** where a street ends: a barrier across it at `at`, the street going on in direction `dir` behind it, `half` wide to each side */
export const WALDSEE_BARRIERS: { at: [number, number]; dir: [number, number]; half: number; lake: boolean }[] = [
%s
];
/** trees on the meadows by the lake and on its far side (tiles); nobody gets there */
export const WALDSEE_SHORE_TREES: [number, number][] = [%s];
/** the pedal boat on the lake behind the police lane, an angler standing on it (tiles), if the lake is there */
export const WALDSEE_BOAT: [number, number] | null = %s;
''' % ('\n'.join("  '%s'," % ''.join(enc({-3:0,-2:1,-1:2,-4:3,-5:4,-6:5}.get(o,o+6)) for o in r) for r in owner),
       '\n'.join("  '%s'," % ''.join(str(v) for v in r) for r in roof),
       '\n'.join("  { kind: '%s', name: %s, col: '%s', roof: '%s', wall: %s,%s cx: %s, cz: %s, ang: %s }," % (h['kind'], js(h['name']), h['col'], h['roof'], h['wall'], (" shut: '%s'," % h['shut']) if h.get('shut') else '', h['cx'], h['cz'], h['ang']) for h in (H[i] for i in sorted(H))),
       fmt(trees), fmt(fountain), ', '.join("{ kind: 'police', at: [%d, %d] }" % c for c in cars),
       '\n'.join("  { name: %s, at: [%s] }," % (js(n), fmt(l)) for n,l in tables.items()),
       js({k:cz[k] for k in ('x','z','dx','dz','len')}),
       js(czSide) if czSide else 'null',
       '\n'.join("  { text: %s, kind: '%s', x: %s, z: %s, dx: %d, dz: %d, len: %d }," % (js(s['text']),s['kind'],s['x'],s['z'],s['dx'],s['dz'],s['len']) for s in signs),
       '\n'.join("  { at: [%s, %s], dir: [%s, %s], half: %s, lake: %s }," % (b['at'][0],b['at'][1],b['dir'][0],b['dir'][1],b['half'],'true' if b['lake'] else 'false') for b in G['barriers']),
       fmt(shore), ('[%d, %d]'%boat) if boat else 'null'))
print('S',S,'E',E,'fire',FIRE,'fountain',fountain,'trees',len(trees),'police',POLICE,'czardas',cz,'tables',{k:len(v) for k,v in tables.items()})
print('signs',[(s['text'],s['x'],s['z'],s['dx'],s['dz'],s['len']) for s in signs],'boat',boat)
