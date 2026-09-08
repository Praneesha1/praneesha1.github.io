import sys, json, struct, numpy as np

def parse_mtl(path):
    mats={}; cur=None
    try:
        for line in open(path, errors='ignore'):
            p=line.split()
            if not p: continue
            if p[0]=='newmtl': cur=p[1]; mats[cur]={'Kd':[0.8,0.8,0.8]}
            elif p[0]=='Kd' and cur: mats[cur]['Kd']=[float(x) for x in p[1:4]]
    except FileNotFoundError: pass
    return mats

def convert(obj_path, mtl_path, out_path, names, order=None):
    V=[];VN=[]; groups={}; gorder=[]; cur=None; mtl='default'
    for line in open(obj_path, errors='ignore'):
        p=line.split()
        if not p: continue
        t=p[0]
        if t=='v': V.append((float(p[1]),float(p[2]),float(p[3])))
        elif t=='vn': VN.append((float(p[1]),float(p[2]),float(p[3])))
        elif t in ('g','o'):
            cur=' '.join(p[1:])
            if cur not in groups: groups[cur]={}; gorder.append(cur)
        elif t=='usemtl': mtl=p[1]
        elif t=='f' and cur is not None:
            corners=[]
            for tok in p[1:]:
                parts=tok.split('/')
                vi=int(parts[0]); vi = vi-1 if vi>0 else len(V)+vi
                ni=None
                if len(parts)>=3 and parts[2]: 
                    ni=int(parts[2]); ni = ni-1 if ni>0 else len(VN)+ni
                corners.append((vi,ni))
            tris=groups[cur].setdefault(mtl,[])
            for k in range(1,len(corners)-1):
                tris.append((corners[0],corners[k],corners[k+1]))
    V=np.array(V,dtype=np.float32); VN=np.array(VN,dtype=np.float32) if VN else None
    mats=parse_mtl(mtl_path)
    if order: gorder=[g for g in order if g in groups]+[g for g in gorder if g not in order]
    bin_parts=[]; offset=0
    bufferViews=[]; accessors=[]; meshes=[]; nodes=[]; materials=[]; matindex={}
    def add_view(arr, target):
        nonlocal offset
        b=arr.tobytes(); pad=(4-len(b)%4)%4
        bin_parts.append(b+b'\0'*pad)
        bufferViews.append({'buffer':0,'byteOffset':offset,'byteLength':len(b),'target':target})
        offset+=len(b)+pad
        return len(bufferViews)-1
    def get_mat(m):
        if m not in matindex:
            kd=mats.get(m,{}).get('Kd',[0.8,0.8,0.8])
            materials.append({'name':m,'pbrMetallicRoughness':{'baseColorFactor':kd+[1.0],'metallicFactor':0.3,'roughnessFactor':0.55},'doubleSided':True})
            matindex[m]=len(materials)-1
        return matindex[m]
    for g in gorder:
        prims=[]
        for m,tris in groups[g].items():
            if not tris: continue
            keymap={}; pos=[]; nrm=[]; idx=[]
            for tri in tris:
                # compute face normal fallback
                if VN is None or any(c[1] is None for c in tri):
                    a,b,c=(V[tri[0][0]],V[tri[1][0]],V[tri[2][0]])
                    fn=np.cross(b-a,c-a); n=np.linalg.norm(fn); fn=fn/n if n>0 else np.array([0,1,0],dtype=np.float32)
                for (vi,ni) in tri:
                    key=(vi,ni if ni is not None else ('f',len(pos)))
                    if key not in keymap:
                        keymap[key]=len(pos); pos.append(V[vi]); nrm.append(VN[ni] if ni is not None else fn)
                    idx.append(keymap[key])
            pos=np.array(pos,dtype=np.float32); nrm=np.array(nrm,dtype=np.float32); idx=np.array(idx,dtype=np.uint32)
            pv=add_view(pos,34962); nv=add_view(nrm,34962); iv=add_view(idx,34963)
            accessors.append({'bufferView':pv,'componentType':5126,'count':len(pos),'type':'VEC3','min':pos.min(0).tolist(),'max':pos.max(0).tolist()}); pa=len(accessors)-1
            accessors.append({'bufferView':nv,'componentType':5126,'count':len(nrm),'type':'VEC3'}); na=len(accessors)-1
            accessors.append({'bufferView':iv,'componentType':5125,'count':len(idx),'type':'SCALAR'}); ia=len(accessors)-1
            prims.append({'attributes':{'POSITION':pa,'NORMAL':na},'indices':ia,'material':get_mat(m),'mode':4})
        if not prims: continue
        name=names.get(g,g)
        meshes.append({'name':name,'primitives':prims})
        nodes.append({'name':name,'mesh':len(meshes)-1,'extras':{'objGroup':g}})
    gltf={'asset':{'version':'2.0','generator':'obj2glb.py'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],
          'nodes':nodes,'meshes':meshes,'materials':materials,'accessors':accessors,'bufferViews':bufferViews,
          'buffers':[{'byteLength':offset}]}
    js=json.dumps(gltf,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
    binb=b''.join(bin_parts)
    total=12+8+len(js)+8+len(binb)
    with open(out_path,'wb') as f:
        f.write(struct.pack('<III',0x46546C67,2,total))
        f.write(struct.pack('<II',len(js),0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II',len(binb),0x004E4942)); f.write(binb)
    print(f"wrote {out_path}: {total/1e6:.2f} MB, {len(nodes)} parts, {len(materials)} materials")
    for n in nodes: print("  ",n['extras']['objGroup'],'->',n['name'])

ENGINE={'Body1':'Engine block','Body1:1':'Crankshaft',
 'Body1:2':'Connecting rod 1','Body1:4':'Connecting rod 2','Body1:6':'Connecting rod 3','Body1:8':'Connecting rod 4',
 'Body1:3':'Rod cap 1','Body1:5':'Rod cap 2','Body1:7':'Rod cap 3','Body1:9':'Rod cap 4',
 'Body1:10':'Piston pin 1','Body1:11':'Piston pin 2','Body1:12':'Piston pin 3','Body1:13':'Piston pin 4',
 'Body1:14':'Piston 1','Body1:15':'Piston 2','Body1:16':'Piston 3','Body1:17':'Piston 4',
 'Body1:18':'Pin clip 1a','Body1:22':'Pin clip 1b','Body1:19':'Pin clip 2a','Body1:23':'Pin clip 2b',
 'Body1:20':'Pin clip 3a','Body1:24':'Pin clip 3b','Body1:21':'Pin clip 4a','Body1:25':'Pin clip 4b'}
ENGINE_ORDER=['Body1','Body1:1','Body1:14','Body1:10','Body1:18','Body1:22','Body1:2','Body1:3',
 'Body1:15','Body1:11','Body1:19','Body1:23','Body1:4','Body1:5',
 'Body1:16','Body1:12','Body1:20','Body1:24','Body1:6','Body1:7',
 'Body1:17','Body1:13','Body1:21','Body1:25','Body1:8','Body1:9']
ORNI={'Body1':'Fuselage shaft','Body1:1':'Main frame','Body1:2':'Crank','Body2':'Rear hub','Body1:7':'Tail bracket','Body1:8':'Tail plane',
 'Body1:3':'Left link','Body1:6':'Right link','Body1:4':'Left wing root','Body1:5':'Right wing root','Body1:9':'Left wing','Body1:10':'Right wing'}
ORNI_ORDER=['Body1:1','Body1','Body1:2','Body1:3','Body1:4','Body1:9','Body1:6','Body1:5','Body1:10','Body1:7','Body2','Body1:8']
base='/Users/opixdown/Desktop/protfolio/'
convert(base+'Four_Cylinder-Engine-Project-main/Four Cyclinder Engine.obj', base+'Four_Cylinder-Engine-Project-main/Four Cyclinder Engine.mtl', base+'assets/models/engine.glb', ENGINE, ENGINE_ORDER)
convert(base+'Ornithopter-Design-Fusion-360-main/Ornithoper_model.obj', base+'Ornithopter-Design-Fusion-360-main/Ornithoper_model.mtl', base+'assets/models/ornithopter.glb', ORNI, ORNI_ORDER)
