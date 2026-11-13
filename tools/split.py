import json, re
FW=str.maketrans("０１２３４５６７８９（）","0123456789()")
qs=json.load(open("raw.json"))
pat=re.compile(r"\(\s*([123])\s*\)")
out=[];bad=[]
for q in qs:
    t=q["raw"].translate(FW)
    ms=list(pat.finditer(t))
    # find sequence 1,2,3 in order (last occurrence chain)
    seq=None
    for i,m in enumerate(ms):
        if m.group(1)=="1":
            j=[k for k in range(i+1,len(ms)) if ms[k].group(1)=="2"]
            if not j: continue
            k3=[k for k in range(j[0]+1,len(ms)) if ms[k].group(1)=="3"]
            if k3: seq=(m,ms[j[0]],ms[k3[0]]); 
    if not seq: bad.append(q["no"]); continue
    a,b,c=seq
    stem=t[:a.start()].strip()
    o=[t[a.end():b.start()].strip(),t[b.end():c.start()].strip(),t[c.end():].strip()]
    out.append({"n":q["no"],"q":stem,"o":o,"a":q["ans"],"p":q["page"]})
    if q["ans"] not in (1,2,3) or not all(o): bad.append(q["no"])
print(len(out),"bad",bad)
json.dump(out,open("bank.json","w"),ensure_ascii=False)
import random
for x in random.sample(out,3): print(x)
print([x for x in out if x["n"] in (1,2,3)])
print("empty stem:",[x["n"] for x in out if not x["q"]][:40], len([x for x in out if not x["q"]]))
