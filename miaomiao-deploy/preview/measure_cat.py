# 贴纸猫地标测量 v3：正确耳基 + 圆形小眼过滤 + 归一化比例表
from PIL import Image
import sys, math
from collections import deque

def analyze(path, label):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    px = im.load()
    bg = px[8, 8]
    def isbg(c, tol=25):
        return abs(c[0]-bg[0]) + abs(c[1]-bg[1]) + abs(c[2]-bg[2]) < tol

    sx, sy = W//2, int(H*0.55)
    while isbg(px[sx, sy]): sy -= 4
    seen = set([(sx, sy)]); q = deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        for dx, dy in ((2,0),(-2,0),(0,2),(0,-2)):
            nx, ny = x+dx, y+dy
            if 0<=nx<W and 0<=ny<H and (nx,ny) not in seen and not isbg(px[nx,ny]):
                seen.add((nx,ny)); q.append((nx,ny))
    miny = min(p[1] for p in seen); maxy = max(p[1] for p in seen)
    minx = min(p[0] for p in seen); maxx = max(p[0] for p in seen)
    FH = maxy - miny; FW = maxx - minx

    # 耳基：从顶向下扫，连续3个单段行 → 头顶线
    def nseg(y):
        xs = sorted(pt[0] for pt in seen if pt[1]==y)
        if not xs: return 0
        segs = 1
        for i in range(1,len(xs)):
            if xs[i]-xs[i-1] > 8: segs += 1
        return segs
    ear_base = miny
    run = 0
    for y in range(miny, miny+int(FH*0.55), 2):
        if nseg(y) == 1:
            run += 1
            if run >= 3: ear_base = y-4; break
        else: run = 0

    # 实心宽度（去胡须）
    solid = set()
    for (x,y) in seen:
        if all((x,y+dy) in seen for dy in range(-16,17,4)): solid.add((x,y))
    srows = {}
    for (x,y) in solid:
        a = srows.get(y)
        if a is None: srows[y] = [x,x]
        else:
            if x<a[0]: a[0]=x
            if x>a[1]: a[1]=x
    sys_ = sorted(srows)
    waist_y, waist_w = None, 1e18
    for y in sys_:
        r = (y-miny)/FH
        if 0.40 <= r <= 0.80:
            w = srows[y][1]-srows[y][0]
            if w < waist_w: waist_w, waist_y = w, y
    if waist_y is None:
        print(label, 'waist fail'); return
    head_w = max(srows[y][1]-srows[y][0] for y in sys_ if y <= waist_y)
    body_w = max(srows[y][1]-srows[y][0] for y in sys_ if y > waist_y)

    # 暗色内部块 → 眼（小而圆，在耳基之下）/嘴
    def isdark(c): return c[0]<90 and c[1]<90 and c[2]<110
    def inside(x,y):
        for dx in (-14,0,14):
            for dy in (-14,0,14):
                if isbg(px[min(W-1,max(0,x+dx)), min(H-1,max(0,y+dy))]): return False
        return True
    darks = [(x,y) for (x,y) in seen if y > ear_base and y < waist_y and isdark(px[x,y]) and inside(x,y)]
    clusters = []
    for p in darks:
        best=None; bd=1e9
        for c in clusters:
            d=abs(p[0]-c['cx'])+abs(p[1]-c['cy'])
            if d<bd: bd,best=d,c
        if best and bd<50:
            best['pts'].append(p); n=len(best['pts'])
            best['cx']=sum(q[0] for q in best['pts'])/n
            best['cy']=sum(q[1] for q in best['pts'])/n
        else:
            clusters.append({'cx':p[0],'cy':p[1],'pts':[p]})
    eyes=[]
    for c in clusters:
        n=len(c['pts'])
        if n<15: continue
        xs=[p[0] for p in c['pts']]; ys=[p[1] for p in c['pts']]
        bw,bh = max(xs)-min(xs), max(ys)-min(ys)
        ar = bw/bh if bh else 9
        fill = n/((bw/2+1)*(bh/2+1))
        if 0.5<ar<1.6 and fill>0.55: eyes.append(c)
    eyes.sort(key=lambda c:-len(c['pts']))
    eyes = sorted(eyes[:2], key=lambda c:c['cx'])
    mouth=None
    if len(eyes)==2:
        mx=(eyes[0]['cx']+eyes[1]['cx'])/2
        cand=[c for c in clusters if c not in eyes and abs(c['cx']-mx)<head_w*0.08 and c['cy']>eyes[0]['cy']]
        if cand: mouth=max(cand,key=lambda c:len(c['pts']))

    # 腮红
    def isblush(c):
        return c[0]>225 and 140<c[1]<220 and 110<c[2]<210 and c[0]-c[2]>35
    bpx=[p for p in seen if isblush(px[p[0],p[1]])]
    bl=[None,None]
    if len(eyes)==2:
        midx=(eyes[0]['cx']+eyes[1]['cx'])/2
        for side,sel in ((0,[p for p in bpx if p[0]<midx]),(1,[p for p in bpx if p[0]>=midx])):
            if len(sel)>40:
                n=len(sel)
                bl[side]=(sum(q[0] for q in sel)/n, sum(q[1] for q in sel)/n, n)

    T=FH; hw=head_w
    out={'label':label}
    out['WH']=FW/FH
    out['headW/H']=hw/T
    out['bodyW/headW']=body_w/hw
    out['earH/H']=(ear_base-miny)/T
    out['earH/headW']=(ear_base-miny)/hw
    if len(eyes)==2:
        d=4*math.sqrt(len(eyes[0]['pts'])/math.pi)
        exd=abs(eyes[1]['cx']-eyes[0]['cx']); eyey=(eyes[0]['cy']+eyes[1]['cy'])/2
        out['eyeD/headW']=d/hw
        out['eyeSP/headW']=exd/hw
        out['eyeY_aboveGround/H']=(maxy-eyey)/T
        if mouth: out['mouthY/H']=(maxy-mouth['cy'])/T
        if bl[0] and bl[1]:
            br_=4*math.sqrt(bl[0][2]/math.pi)
            out['blushD/headW']=br_/hw
            out['blushSP/headW']=abs(bl[1][0]-bl[0][0])/hw
            out['blushY-eyeY/H']=(eyey-bl[0][1])/T
    print(f'== {label} ==')
    for k,v in out.items():
        if k!='label': print(f'  {k:22s} {v:.3f}')
    print()
    return out

if __name__=='__main__':
    for p,l in [('refs/ref1_white_cat.png','REF1 白猫'),('refs/ref2_tuxedo_cat.png','REF2 奶牛猫')]:
        try: analyze(p,l)
        except Exception as e: print(l,'ERR',e)
