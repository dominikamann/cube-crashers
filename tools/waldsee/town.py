"""The Town (Bad Waldsee) -> tiles. Reads an OpenStreetMap extract (osm2.json, (c) OpenStreetMap contributors, ODbL)
and writes grid2.json: where one can walk, a house number per wall tile, the colours and heights of every house,
where the streets go on beyond the map (behind a barrier), and where the things one knows the place by are."""
import json, math
from PIL import Image, ImageDraw
d=json.load(open('osm2.json'))
nodes={e['id']:(e['lat'],e['lon']) for e in d['elements'] if e['type']=='node'}

# ---- the map: the Hochstatt with the Czardas, the Federle-Brunnen and its trees, and the streets that meet there,
# each a little way: the Hauptstrasse from the Wurzacher Strasse up past the police, the Wurzacher Strasse east to
# three houses past the ice-cream parlour, the Ravensburger Strasse along the west of the square from above the
# trees down to the kebab shop, and the lane by the police down toward the lake. Every way out ends at a
# barrier, with the street painted on a little behind it.
LAT0,LON0=47.91968,9.75590
M=1.6; N=128
mx=111320*math.cos(math.radians(LAT0)); my=110540
def tile(lat,lon): return ((lon-LON0)*mx/M+N/2, N/2-(lat-LAT0)*my/M)
SS=8
# the ways that are open, and for some the part of them that is (a test on latitude and longitude)
OPEN={
 674183231: None,                                          # Hochstatt
 183420784: lambda la,lo: lo>=9.75478,                     # Grabenmühlplatz, the square (not on west toward the bank)
 156662898: lambda la,lo: la<=47.92003,                    # Hauptstrasse: up past the police, no further
 183420787: lambda la,lo: lo<=9.75641,                     # Wurzacher Strasse: three houses past the ice-cream parlour
 330261223: lambda la,lo: la>=47.91951,                    # Am Ravensburger Tor: shut right at the corner
 179860017: lambda la,lo: 47.91929<=la<=47.91991,          # Ravensburger Strasse: from above the trees to the kebab shop
 693900999: lambda la,lo: lo<=9.75636,                     # Oberamteigasse: the lane by the police, a little way down
}
# how far from its middle a way is open (metres), and how far a street is painted on behind its barrier
REACH={'pedestrian':11,'living_street':7.5,'residential':6,'footway':3}
BEYOND=22
# behind the barrier of the police lane lies the lake (it is a little further in truth): a pedal boat on it
LAKE_WAY=693900999
KNOWN={}
ADDR={('Hochstatt','5'):'f1dc7a'}
PLASTER=['f4f1ea','f1e7c9','f3dc86','ecd0a0','e9b9a6','f0c9c9','cfe0c0','b9d8a0','c6d9e6','dfe3e8','efe6d6','e6c98c','d9e2d0','f6efe0','e8d5bd','f7f3ee','f1c8a8','8fb1e0']
# (roof tiles as they look from the air on a sunny day: warm terracotta, some older and browner)
ROOFS=['b45a3c','c06544','a9553a','b8623f','9c5038','c46b48','a85a40','8f4c38']
GARDEN,WATER,STREET,MEADOW,GRAVEL=-2,-3,-4,-5,-6

# ---- every house on its own sheet: the share of each tile it covers
cover={}; houses=[]
for e in d['elements']:
    if e['type']!='way' or 'building' not in e.get('tags',{}): continue
    pts=[tile(*nodes[n]) for n in e['nodes'] if n in nodes]
    if len(pts)<3: continue
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    x0,x1,y0,y1=int(min(xs))-1,int(max(xs))+2,int(min(ys))-1,int(max(ys))+2
    if x1<0 or y1<0 or x0>=N or y0>=N: continue
    im=Image.new('L',((x1-x0)*SS,(y1-y0)*SS),0)
    ImageDraw.Draw(im).polygon([((x-x0)*SS,(y-y0)*SS) for x,y in pts],fill=255)
    sm=im.resize((x1-x0,y1-y0),Image.BOX)
    hid=len(houses); houses.append({'osm':e['id'],'tags':e.get('tags',{})})
    for yy in range(y1-y0):
        for xx in range(x1-x0):
            v=sm.getpixel((xx,yy))/255
            if v>0.02 and 0<=x0+xx<N and 0<=y0+yy<N: cover.setdefault((x0+xx,y0+yy),[]).append((v,hid))

# ---- the open ways, cut where the map ends; what lies behind a cut is the street painted on, and a barrier
def metres(a,b): return math.hypot((a[1]-b[1])*mx,(a[0]-b[0])*my)
segs=[]; beyond=[]; lake=[]; barriers=[]
for e in d['elements']:
    if e['type']!='way' or e['id'] not in OPEN: continue
    keep=OPEN[e['id']] or (lambda la,lo: True)
    ll=[nodes[n] for n in e['nodes'] if n in nodes]
    r=REACH[e['tags']['highway']]/M
    # finer steps, so a cut falls where it should
    fine=[ll[0]]
    for a,b in zip(ll,ll[1:]):
        k=max(1,int(metres(a,b)/1.0))
        fine+=[(a[0]+(b[0]-a[0])*i/k,a[1]+(b[1]-a[1])*i/k) for i in range(1,k+1)]
    for a,b in zip(fine,fine[1:]):
        if keep(*a) and keep(*b): segs.append((tile(*a),tile(*b),r))
    for order in (fine,fine[::-1]):
        for i in range(1,len(order)):
            if keep(*order[i-1]) and not keep(*order[i]):
                cut=order[i-1]; ahead=order[i:]
                run=[cut]; far=0
                for p in ahead:
                    far+=metres(run[-1],p)
                    if far>BEYOND: break
                    run.append(p)
                dirv=(tile(*run[min(3,len(run)-1)])[0]-tile(*cut)[0], tile(*run[min(3,len(run)-1)])[1]-tile(*cut)[1])
                n_=math.hypot(*dirv) or 1
                barriers.append({'at':tile(*cut),'dir':(dirv[0]/n_,dirv[1]/n_),'half':r,'way':e['id']})
                gone=0
                for p,q in zip(run,run[1:]):
                    gone+=metres(p,q)
                    if e['id']!=LAKE_WAY: beyond.append((tile(*p),tile(*q),r))
def near(px,py,sg):
    for (ax,ay),(bx,by),r in sg:
        if min(ax,bx)-r>px or max(ax,bx)+r<px or min(ay,by)-r>py or max(ay,by)+r<py: continue
        dx,dy=bx-ax,by-ay; L=dx*dx+dy*dy
        u=0 if L==0 else max(0,min(1,((px-ax)*dx+(py-ay)*dy)/L))
        if math.hypot(px-ax-u*dx,py-ay-u*dy)<=r: return True
    return False

grid=[['#']*N for _ in range(N)]; owner=[[GARDEN]*N for _ in range(N)]
for y in range(N):
    for x in range(N):
        l=cover.get((x,y),[])
        built=sum(v for v,_ in l)>0.5
        if built: owner[y][x]=max(l)[1]
        elif near(x+0.5,y+0.5,segs): grid[y][x]='.'; owner[y][x]=-1
        elif near(x+0.5,y+0.5,beyond): owner[y][x]=STREET
# a barrier is a line: what lies behind it is not walked on, it is the street painted on
for b_ in barriers:
    for y in range(N):
        for x in range(N):
            if grid[y][x]!='.': continue
            vx,vy=x+0.5-b_['at'][0],y+0.5-b_['at'][1]
            if 0<vx*b_['dir'][0]+vy*b_['dir'][1] and math.hypot(vx,vy)<=b_['half']+3: grid[y][x]='#'; owner[y][x]=STREET
# behind the barrier of the police lane the town ends: a gravel path across, a meadow, and then the lake, wide and
# open, with no house to the left or right of it, and on its far side nothing but meadow and trees. (It lies a
# little further off in truth.)
for b_ in barriers:
    if b_['way']!=LAKE_WAY: continue
    for y in range(N):
        for x in range(N):
            vx,vy=x+0.5-b_['at'][0],y+0.5-b_['at'][1]
            f=(vx*b_['dir'][0]+vy*b_['dir'][1])*M; side=(-vx*b_['dir'][1]+vy*b_['dir'][0])*M
            # (it opens like a fan, narrow at the lane and wide at the water; toward the Wurzacher Strasse, which
            # runs along the same way further south, only a little: its houses stay)
            if f<=0.5 or grid[y][x]=='.' or side>min(22,8+f*0.3) or -side>8+f*0.9: continue
            owner[y][x]=GRAVEL if f<5 else MEADOW if f<15 else WATER if f<70 else MEADOW
for i in range(N):
    for x,y in ((i,0),(i,N-1),(0,i),(N-1,i)):
        grid[y][x]='#'
        if owner[y][x]==-1: owner[y][x]=GARDEN
# what cannot be reached from the fountain is not part of the map
fx,fy=[int(c) for c in tile(47.9198986,9.7554854)]
assert grid[fy][fx]=='.', 'the fountain is on a wall'
seen={(fx,fy)}; todo=[(fx,fy)]
while todo:
    x,y=todo.pop()
    for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
        if 0<=nx<N and 0<=ny<N and grid[ny][nx]=='.' and (nx,ny) not in seen: seen.add((nx,ny)); todo.append((nx,ny))
for y in range(N):
    for x in range(N):
        if grid[y][x]=='.' and (x,y) not in seen: grid[y][x]='#'; owner[y][x]=GARDEN

# ---- the Hochstatt in front of the Czardas is a tile wider all round than it is drawn: the houses round it step
# back by one (not the Czardas itself)
CZ=tile(47.9199809,9.7556819)
czHouse=min(((owner[y][x],math.hypot(x+0.5-CZ[0],y+0.5-CZ[1])) for y in range(N) for x in range(N) if owner[y][x]>=0),key=lambda p:p[1])[0]
K=2.9/M; back=[]
for y in range(int(CZ[1]-4*K),int(CZ[1]+12*K)):
    for x in range(int(CZ[0]-13*K),int(CZ[0]+7*K)):
        if not(0<x<N-1 and 0<y<N-1) or grid[y][x]=='.' or owner[y][x] in (czHouse,WATER,STREET,MEADOW,GRAVEL): continue
        if any(grid[y+oy][x+ox]=='.' for ox,oy in((1,0),(-1,0),(0,1),(0,-1))): back.append((x,y))
for x,y in back: grid[y][x]='.'; owner[y][x]=-1

# ---- no way is narrower than three tiles: where one is, what stands beside it gives way
def span(x,y,dx,dy):
    n=1
    for s in (1,-1):
        k=1
        while 0<x+dx*k*s<N-1 and 0<y+dy*k*s<N-1 and grid[y+dy*k*s][x+dx*k*s]=='.': n+=1; k+=1
    return n
for _ in range(4):
    opened=[]
    for y in range(1,N-1):
        for x in range(1,N-1):
            if grid[y][x]!='.': continue
            for dx,dy in ((1,0),(0,1)):
                if span(x,y,dx,dy)>2: continue
                sides=[p for p in ((x+dx,y+dy),(x-dx,y-dy)) if 0<p[0]<N-1 and 0<p[1]<N-1 and owner[p[1]][p[0]] not in (WATER,STREET,MEADOW,GRAVEL)]
                if not sides: continue
                cost=lambda p: 0 if owner[p[1]][p[0]]==GARDEN else 2 if owner[p[1]][p[0]]==czHouse else 1
                opened.append(min(sides,key=cost))
    for x,y in opened: grid[y][x]='.'; owner[y][x]=-1

# ---- no green anywhere: a yard or a garden is built over by the houses next to it
left={(x,y) for y in range(N) for x in range(N) if owner[y][x]==GARDEN}
while left:
    grow=[]
    for x,y in left:
        nb=[owner[y+oy][x+ox] for ox,oy in ((1,0),(-1,0),(0,1),(0,-1)) if 0<=x+ox<N and 0<=y+oy<N and owner[y+oy][x+ox]>=0]
        if nb: grow.append((x,y,max(set(nb),key=nb.count)))
    if not grow: break
    for x,y,o in grow: owner[y][x]=o; left.discard((x,y))

# ---- the houses: colours and heights. One walks here and looks up at them, so they are as tall as houses are
used=sorted({owner[y][x] for y in range(N) for x in range(N) if owner[y][x]>=0})
remap={h:i for i,h in enumerate(used)}
def h01(n,k): return ((n*2654435761+k*40503)%1000003)/1000003
out=[]
for h in used:
    t=houses[h]['tags']
    tiles=[(x,y) for y in range(N) for x in range(N) if owner[y][x]==h]
    cxm=sum(x for x,_ in tiles)/len(tiles); cym=sum(y for _,y in tiles)/len(tiles)
    sxx=sum((x-cxm)**2 for x,_ in tiles); syy=sum((y-cym)**2 for _,y in tiles); sxy=sum((x-cxm)*(y-cym) for x,y in tiles)
    ang=0.5*math.atan2(2*sxy,sxx-syy)
    kind='house'; col=PLASTER[int(h01(houses[h]['osm'],1)*len(PLASTER))]; roof=ROOFS[int(h01(houses[h]['osm'],2)*len(ROOFS))]
    if t.get('name') in KNOWN: col,roof,kind=KNOWN[t['name']]
    a=(t.get('addr:street'),t.get('addr:housenumber'))
    if a in ADDR: col=ADDR[a]
    wall=round(4.0+1.8*h01(houses[h]['osm'],3),2)
    if kind=='gate': wall=9.5
    out.append({'id':remap[h],'kind':kind,'name':t.get('name',''),'col':col,'roof':roof,'wall':wall,'ang':round(ang,3),'cx':round(cxm+0.5,2),'cz':round(cym+0.5,2),'n':len(tiles)})

pois={'T':[],'F':[],'named':[]}
for e in d['elements']:
    t=e.get('tags',{})
    if e['type']=='node' and t:
        x,y=tile(e['lat'],e['lon'])
        if not(1<=x<N-1 and 1<=y<N-1): continue
        if t.get('natural')=='tree': pois['T'].append((round(x,2),round(y,2)))
        elif t.get('amenity')=='fountain': pois['F'].append((t.get('name',''),round(x,2),round(y,2)))
        elif t.get('name') and (t.get('amenity') in ('cafe','restaurant','bar','pub','ice_cream','bank','police') or t.get('shop')): pois['named'].append((t['name'],t.get('amenity') or t.get('shop'),t.get('outdoor_seating',''),round(x,2),round(y,2)))
marks={'czardas':CZ,'police':tile(47.9199219,9.755962),'czHouse':remap.get(czHouse,-1),'m':M,
       'eis':tile(47.9196534,9.7560125),'amadeus':tile(47.9194173,9.755166),'hasen':tile(47.9200925,9.7545265),'bank':tile(47.9195661,9.754414),
       'federle':tile(47.9198986,9.7554854),'reise':tile(47.91989,9.75508),'memo':tile(47.91929,9.75512)}
json.dump({'rows':[''.join(r) for r in grid],'owner':[[remap.get(o,o) for o in r] for r in owner],'houses':out,'pois':pois,'marks':marks,
           'barriers':[{'at':[round(b['at'][0],2),round(b['at'][1],2)],'dir':[round(b['dir'][0],3),round(b['dir'][1],3)],'half':round(b['half'],2),'lake':b['way']==LAKE_WAY} for b in barriers]},open('grid2.json','w'))
print(len(out),'houses', sum(1 for r in grid for c in r if c=='.'),'floor tiles', len(barriers),'barriers', sum(1 for r in owner for o in r if o==GARDEN),'garden left')
show=[[('~' if owner[y][x]==WATER else '"' if owner[y][x]==MEADOW else '_' if owner[y][x]==GRAVEL else ':' if owner[y][x]==STREET else ',' if owner[y][x]==GARDEN else grid[y][x]) for x in range(N)] for y in range(N)]
for x,y in pois['T']: show[int(y)][int(x)]='T'
for _,x,y in pois['F']: show[int(y)][int(x)]='F'
for b in barriers: show[int(b['at'][1])][int(b['at'][0])]='B'
for k,ch in (('czardas','C'),('police','P'),('eis','I'),('amadeus','A'),('hasen','H'),('reise','R'),('memo','M')): show[max(0,min(N-1,int(marks[k][1])))][max(0,min(N-1,int(marks[k][0])))]=ch
for y,r in enumerate(show): print('%3d '%y+''.join(r))
