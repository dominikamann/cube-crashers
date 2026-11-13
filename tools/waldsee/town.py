"""Bad Waldsee old town -> tiles. Reads an OpenStreetMap extract (osm2.json, (c) OpenStreetMap contributors, ODbL)
and writes grid2.json: walls and floor, a house number per wall tile, and for every house its colours and heights."""
import json, math, colorsys
from PIL import Image, ImageDraw
d=json.load(open('osm2.json'))
nodes={e['id']:(e['lat'],e['lon']) for e in d['elements'] if e['type']=='node'}
LAT0,LON0=47.92065,9.75405
M=2.9; N=110
mx=111320*math.cos(math.radians(LAT0)); my=110540
def tile(lat,lon): return ((lon-LON0)*mx/M+N/2, N/2-(lat-LAT0)*my/M)
SS=8
KNOWN_NAMES=('Rathaus Bad Waldsee','Kornhaus','Pfarrkirche St. Peter','Vötschenturm Stadtmauer','Schloss Waldsee')
ways=[e for e in d['elements'] if e['type']=='way' and 'building' in e.get('tags',{})]
# every house on its own sheet: the share of each tile it covers
cover={}
houses=[]
for e in ways:
    pts=[tile(*nodes[n]) for n in e['nodes'] if n in nodes]
    if len(pts)<3: continue
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    x0,x1,y0,y1=int(min(xs))-1,int(max(xs))+2,int(min(ys))-1,int(max(ys))+2
    if x1<0 or y1<0 or x0>=N or y0>=N: continue
    im=Image.new('L',((x1-x0)*SS,(y1-y0)*SS),0)
    ImageDraw.Draw(im).polygon([((x-x0)*SS,(y-y0)*SS) for x,y in pts],fill=255)
    sm=im.resize((x1-x0,y1-y0),Image.BOX)
    hid=len(houses)
    houses.append({'osm':e['id'],'tags':e.get('tags',{}),'pts':pts})
    for yy in range(y1-y0):
        for xx in range(x1-x0):
            v=sm.getpixel((xx,yy))/255
            if v>0.02 and 0<=x0+xx<N and 0<=y0+yy<N: cover.setdefault((x0+xx,y0+yy),[]).append((v,hid))
# where one can walk: on the streets, lanes, paths and squares, as wide as they are (metres from their middle)
# (the main streets and the squares are wide, and the houses along them step back for it; the back lanes, yards and
# service ways are left out: a town to play in has fewer side lanes than the real one)
REACH={'pedestrian':13,'living_street':10.5,'residential':6.2,'secondary':6.5,'tertiary':6.5,'footway':3}
# this close to the middle of a street nothing stands, not even a house (the landmarks stay whole)
CARVE={'pedestrian':7.2,'living_street':6.2,'residential':4.4,'secondary':4.4,'tertiary':4.4}
# lanes that just end are left out: a way whose end joins nothing else goes, and then the next one that this leaves
# without a way on (the squares and the main streets of the old town stay, wherever they end)
KEEP=('pedestrian','living_street')
streets={e['id']:e for e in d['elements'] if e['type']=='way' and e.get('tags',{}).get('highway') in REACH}
def inside(n):
    x,y=tile(*nodes[n]); return 2<x<N-2 and 2<y<N-2
while True:
    deg={}
    for e in streets.values():
        ns=[n for n in e['nodes'] if n in nodes]
        for i,n in enumerate(ns): deg[n]=deg.get(n,0)+(1 if i in (0,len(ns)-1) else 2)
    dead=[i for i,e in streets.items() if e['tags']['highway'] not in KEEP and any(deg.get(n,0)<=1 for n in (e['nodes'][0],e['nodes'][-1]) if n in nodes)]
    if not dead: break
    for i in dead: del streets[i]
# (the Hochstatt keeps its true shape, a tile wider all round: there the streets are as wide as they are, the houses
# stay whole and every lane is there)
HOCH=tile(47.9198986,9.7554854)
inHoch=lambda x,y: HOCH[0]-12<=x<=HOCH[0]+17 and HOCH[1]-10<=y<=HOCH[1]+11
REACH_TRUE={'pedestrian':9.5,'living_street':7.5,'residential':5,'secondary':6,'tertiary':6,'service':3.6,'footway':2.6,'path':2.6,'steps':2.6}
segsTrue=[]
segs=[]; carve=[]; areas=Image.new('L',(N*SS,N*SS),0); water=Image.new('L',(N*SS,N*SS),0)
for e in d['elements']:
    if e['type']!='way': continue
    t=e.get('tags',{}); pts=[tile(*nodes[n]) for n in e['nodes'] if n in nodes]
    if t.get('highway') in REACH_TRUE:
        for p,q in zip(pts,pts[1:]): segsTrue.append((p,q,REACH_TRUE[t['highway']]/M))
    if t.get('highway') in REACH and (e['id'] in streets or t.get('area')=='yes'):
        if t.get('area')=='yes' and len(pts)>2: ImageDraw.Draw(areas).polygon([(x*SS,y*SS) for x,y in pts],fill=255)
        r=REACH[t['highway']]/M
        for p,q in zip(pts,pts[1:]): segs.append((p,q,r))
        if t['highway'] in CARVE:
            for p,q in zip(pts,pts[1:]): carve.append((p,q,CARVE[t['highway']]/M))
    # (a car park is an open square)
    if t.get('amenity')=='parking' and len(pts)>2: ImageDraw.Draw(areas).polygon([(x*SS,y*SS) for x,y in pts],fill=255)
    if t.get('natural')=='water' and len(pts)>2: ImageDraw.Draw(water).polygon([(x*SS,y*SS) for x,y in pts],fill=255)
areas=areas.resize((N,N),Image.BOX); water=water.resize((N,N),Image.BOX)
def near(px,py,segs=None):
    for (ax,ay),(bx,by),r in (segs if segs is not None else SEGS):
        if min(ax,bx)-r>px or max(ax,bx)+r<px or min(ay,by)-r>py or max(ay,by)+r<py: continue
        dx,dy=bx-ax,by-ay; L=dx*dx+dy*dy
        u=0 if L==0 else max(0,min(1,((px-ax)*dx+(py-ay)*dy)/L))
        if math.hypot(px-ax-u*dx,py-ay-u*dy)<=r: return True
    return False
GARDEN,WATER=-2,-3
SEGS=segs
grid=[['#']*N for _ in range(N)]; owner=[[GARDEN]*N for _ in range(N)]
for y in range(N):
    for x in range(N):
        l=cover.get((x,y),[])
        if sum(v for v,_ in l)>0.5 and (inHoch(x,y) or houses[max(l)[1]]['tags'].get('name') in KNOWN_NAMES or not near(x+0.5,y+0.5,carve)): owner[y][x]=max(l)[1]
        elif water.getpixel((x,y))>128: owner[y][x]=WATER
        elif areas.getpixel((x,y))>100 or near(x+0.5,y+0.5,segsTrue if inHoch(x,y) else None): grid[y][x]='.'; owner[y][x]=-1
for i in range(N):
    for x,y in ((i,0),(i,N-1),(0,i),(N-1,i)): grid[y][x]='#'
fx,fy=[int(c) for c in tile(47.9198986,9.7554854)]
assert grid[fy][fx]=='.'
seen={(fx,fy)}; todo=[(fx,fy)]
while todo:
    x,y=todo.pop()
    for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
        if 0<=nx<N and 0<=ny<N and grid[ny][nx]=='.' and (nx,ny) not in seen: seen.add((nx,ny)); todo.append((nx,ny))
for y in range(N):
    for x in range(N):
        if grid[y][x]=='.' and (x,y) not in seen: grid[y][x]='#'; owner[y][x]=GARDEN
for i in range(N):
    for x,y in ((i,0),(i,N-1),(0,i),(N-1,i)):
        if owner[y][x]==-1: owner[y][x]=GARDEN
# the Hochstatt in front of the Czardas is a tile wider all round than it is drawn: the houses and gardens round
# it step back by one (not the Czardas itself)
CZ=tile(47.9199809,9.7556819)
czHouse=min(((owner[y][x],math.hypot(x+0.5-CZ[0],y+0.5-CZ[1])) for y in range(N) for x in range(N) if owner[y][x]>=0),key=lambda p:p[1])[0]
back=[]
for y in range(int(CZ[1])-4,int(CZ[1])+12):
    for x in range(int(CZ[0])-13,int(CZ[0])+7):
        if not(0<x<N-1 and 0<y<N-1) or grid[y][x]=='.' or owner[y][x] in (czHouse,WATER): continue
        if any(grid[y+oy][x+ox]=='.' for ox,oy in((1,0),(-1,0),(0,1),(0,-1))): back.append((x,y))
for x,y in back: grid[y][x]='.'; owner[y][x]=-1
# no way is narrower than two tiles: a kart is 1.4 wide. Where a lane is one tile, the garden beside it gives way,
# or else the house (it loses a strip of 2.9 metres there)
def run(x,y,dx,dy):
    n=1
    for s in (1,-1):
        k=1
        while 0<x+dx*k*s<N-1 and 0<y+dy*k*s<N-1 and grid[y+dy*k*s][x+dx*k*s]=='.': n+=1; k+=1
    return n
for _ in range(2):
    opened=[]
    for y in range(1,N-1):
        for x in range(1,N-1):
            if grid[y][x]!='.': continue
            for dx,dy in ((1,0),(0,1)):
                if run(x,y,dx,dy)>1: continue
                sides=[(x+dx,y+dy),(x-dx,y-dy)]
                sides=[p for p in sides if 0<p[0]<N-1 and 0<p[1]<N-1 and owner[p[1]][p[0]]!=WATER]
                if not sides: continue
                # a garden first; of two houses, the one that is not a landmark
                def cost(p):
                    o=owner[p[1]][p[0]]
                    return 0 if o==GARDEN else 2 if houses[o]['tags'].get('name') in KNOWN_NAMES else 1
                opened.append(min(sides,key=cost))
    for x,y in opened: grid[y][x]='.'; owner[y][x]=-1
# no green in the gaps: a yard or a strip of garden between houses is built over by the houses next to it. Only
# the big green that reaches the edge of the map (the park, the meadows by the lake) stays
seenG=set()
for y0 in range(N):
    for x0 in range(N):
        if owner[y0][x0]!=GARDEN or (x0,y0) in seenG: continue
        comp=[(x0,y0)]; seenG.add((x0,y0)); k=0
        while k<len(comp):
            x,y=comp[k]; k+=1
            for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                if 0<=nx<N and 0<=ny<N and owner[ny][nx]==GARDEN and (nx,ny) not in seenG: seenG.add((nx,ny)); comp.append((nx,ny))
        edge=any(x in (0,N-1) or y in (0,N-1) for x,y in comp)
        if edge and len(comp)>=60: continue
        left=set(comp)
        while left:
            grow=[]
            for x,y in left:
                near_=[owner[y+oy][x+ox] for ox,oy in ((1,0),(-1,0),(0,1),(0,-1)) if 0<=x+ox<N and 0<=y+oy<N and owner[y+oy][x+ox]>=0]
                if near_: grow.append((x,y,max(set(near_),key=near_.count)))
            if not grow: break
            for x,y,o in grow: owner[y][x]=o; left.discard((x,y))
used=sorted({owner[y][x] for y in range(N) for x in range(N) if owner[y][x]>=0})
remap={h:i for i,h in enumerate(used)}
# colours: the ones known from photos, by name or address; the rest from the old town's range of plaster tones
KNOWN={
 'Rathaus Bad Waldsee':('f2efe6','b5523a','rathaus'),
 'Kornhaus':('f4f1ea','c2452d','kornhaus'),
 'Pfarrkirche St. Peter':('f3ead2','8a8f96','church'),
 'Vötschenturm Stadtmauer':('d8cdb4','8a4a33','tower'),
 'Schloss Waldsee':('f1ead8','a3482f','castle'),
}
ADDR={('Hochstatt','5'):'f1dc7a'}
PLASTER=['f4f1ea','f1e7c9','f3dc86','ecd0a0','e9b9a6','f0c9c9','cfe0c0','b9d8a0','c6d9e6','dfe3e8','efe6d6','e6c98c','d9e2d0','f6efe0','e8d5bd','f7f3ee','f1c8a8']
# (roof tiles as they look from the air on a sunny day: warm terracotta, some older and browner)
ROOFS=['b45a3c','c06544','a9553a','b8623f','9c5038','c46b48','a85a40','8f4c38']
def h01(n,k): return ((n*2654435761+k*40503)%1000003)/1000003
out=[]
for h in used:
    t=houses[h]['tags']; pts=houses[h]['pts']
    tiles=[(x,y) for y in range(N) for x in range(N) if owner[y][x]==h]
    cxm=sum(x for x,_ in tiles)/len(tiles); cym=sum(y for _,y in tiles)/len(tiles)
    # the long axis of the house: its ridge runs along it
    sxx=sum((x-cxm)**2 for x,_ in tiles); syy=sum((y-cym)**2 for _,y in tiles); sxy=sum((x-cxm)*(y-cym) for x,y in tiles)
    ang=0.5*math.atan2(2*sxy,sxx-syy)
    kind='house'; col=PLASTER[int(h01(houses[h]['osm'],1)*len(PLASTER))]; roof=ROOFS[int(h01(houses[h]['osm'],2)*len(ROOFS))]
    if t.get('name') in KNOWN: col,roof,kind=KNOWN[t['name']]
    a=(t.get('addr:street'),t.get('addr:housenumber'))
    if a in ADDR: col=ADDR[a]
    big=len(tiles)
    wall=round(1.25+0.6*h01(houses[h]['osm'],3)+(0.2 if big>30 else 0),2)
    if kind=='rathaus': wall=2.2
    if kind=='kornhaus': wall=2.1
    if kind=='church': wall=2.8
    out.append({'id':remap[h],'kind':kind,'name':t.get('name',''),'col':col,'roof':roof,'wall':wall,'ang':round(ang,3),'cx':round(cxm+0.5,2),'cz':round(cym+0.5,2),'n':big})
pois={'T':[],'F':[],'b':[],'named':[]}
for e in d['elements']:
    t=e.get('tags',{})
    if e['type']=='node' and t:
        x,y=tile(e['lat'],e['lon'])
        if not(1<=x<N-1 and 1<=y<N-1): continue
        if t.get('natural')=='tree': pois['T'].append((round(x,2),round(y,2)))
        elif t.get('amenity')=='fountain': pois['F'].append((t.get('name',''),round(x,2),round(y,2)))
        elif t.get('amenity')=='bench': pois['b'].append((round(x,2),round(y,2)))
        elif t.get('name') and (t.get('amenity') in ('cafe','restaurant','bar','pub','ice_cream') ): pois['named'].append((t['name'],t.get('amenity'),t.get('outdoor_seating',''),round(x,2),round(y,2)))
json.dump({'rows':[''.join(r) for r in grid],'owner':[[remap.get(o,o) for o in r] for r in owner],'houses':out,'pois':pois},open('grid2.json','w'))
print(len(out),'houses', sum(1 for r in grid for c in r if c=='.'),'floor tiles')
show=[[('~' if owner[y][x]==WATER else ',' if owner[y][x]==GARDEN else grid[y][x]) for x in range(N)] for y in range(N)]
for x,y in pois['T']: show[int(y)][int(x)]='T'
for _,x,y in pois['F']: show[int(y)][int(x)]='F'
for hh in out:
    if hh['kind']!='house':
        for y in range(N):
            for x in range(N):
                if owner[y][x]>=0 and remap[owner[y][x]]==hh['id']: show[y][x]={'rathaus':'R','kornhaus':'K','church':'C','tower':'V','castle':'S'}[hh['kind']]
for y,r in enumerate(show): print('%3d '%y+''.join(r))
print([p for p in pois['named']])
print(pois['F'])
