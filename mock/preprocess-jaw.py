#!/usr/bin/env python3
"""
preprocess-jaw.py — turn a dense real mandible STL into the compact, normalized
indexed mesh used by the offline mock (mock/assets/mandible.json).

The committed mock/assets/mandible.json was produced from the Open-Full-Jaw
dataset (CC BY-NC-SA 4.0 — see mock/assets/ATTRIBUTION.md). The source mesh is
git-LFS hosted; to reproduce:

  # 1) get an LFS download URL for Patient_1.zip (public repo, no auth)
  curl -s -X POST \
    "https://github.com/diku-dk/Open-Full-Jaw.git/info/lfs/objects/batch" \
    -H "Accept: application/vnd.git-lfs+json" \
    -H "Content-Type: application/vnd.git-lfs+json" \
    -d '{"operation":"download","transfers":["basic"],"objects":[{"oid":"bf1553ff6c6b40aebe3115883be884b9b2a23e03c282ab657c71cd065ec94215","size":52491493}]}'
  # 2) download + unzip, then run this script on the bone STL:
  python3 mock/preprocess-jaw.py \
    Patient_1/input/mandible/bone/mandible.stl mock/assets/mandible.json 50

Native STL axes are X=left-right, Y=anterior-posterior, Z=superior-inferior;
output is centered at the origin and uniformly scaled to ~24 units. The viewer
frame remap (swap Y/Z, mirror for the opposing arch) is applied in
generate-fixtures.mjs, not here.
"""
import struct, json, sys, os
from collections import OrderedDict

SRC = sys.argv[1]
OUT = sys.argv[2]
GRID = int(sys.argv[3]) if len(sys.argv) > 3 else 50
TARGET_EXTENT = 24.0

raw = open(SRC, "rb").read()
ntri = struct.unpack("<I", raw[80:84])[0]
print(f"input triangles: {ntri}")

tris = []
off = 84
minb = [1e30]*3; maxb = [-1e30]*3
for _ in range(ntri):
    vals = struct.unpack_from("<12f", raw, off); off += 50
    v0, v1, v2 = vals[3:6], vals[6:9], vals[9:12]
    tris.append((v0, v1, v2))
    for v in (v0, v1, v2):
        for k in range(3):
            minb[k] = min(minb[k], v[k]); maxb[k] = max(maxb[k], v[k])

maxdim = max(maxb[k]-minb[k] for k in range(3))
cell = maxdim / GRID

clusters = OrderedDict()
def cidx(v):
    kk = (int((v[0]-minb[0])/cell), int((v[1]-minb[1])/cell), int((v[2]-minb[2])/cell))
    c = clusters.get(kk)
    if c is None:
        c = [v[0], v[1], v[2], 1, len(clusters)]; clusters[kk] = c
    else:
        c[0]+=v[0]; c[1]+=v[1]; c[2]+=v[2]; c[3]+=1
    return c[4]

faces, seen = [], set()
for (a, b, c) in tris:
    ia, ib, ic = cidx(a), cidx(b), cidx(c)
    if ia==ib or ib==ic or ia==ic: continue
    fk = frozenset((ia, ib, ic))
    if fk in seen: continue
    seen.add(fk); faces.append((ia, ib, ic))

used = sorted({i for f in faces for i in f})
remap = {old: new for new, old in enumerate(used)}
rep = {c[4]: (c[0]/c[3], c[1]/c[3], c[2]/c[3]) for c in clusters.values()}
verts = [rep[o] for o in used]
faces = [(remap[a], remap[b], remap[c]) for (a, b, c) in faces]

vminb=[1e30]*3; vmaxb=[-1e30]*3
for v in verts:
    for k in range(3): vminb[k]=min(vminb[k],v[k]); vmaxb[k]=max(vmaxb[k],v[k])
center=[(vminb[k]+vmaxb[k])/2 for k in range(3)]
scale=TARGET_EXTENT/max(vmaxb[k]-vminb[k] for k in range(3))
positions=[round((v[k]-center[k])*scale,4) for v in verts for k in range(3)]
indices=[i for f in faces for i in f]

print(f"decimated: verts={len(verts)} faces={len(faces)}")
json.dump({"positions": positions, "indices": indices}, open(OUT, "w"))
print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")
