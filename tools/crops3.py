import pdfplumber, json, re, os, shutil
bank={x["n"]:x for x in json.load(open("bank.json"))}
full={n for n,x in bank.items() if any(len(o.strip(" 。"))<1 for o in x["o"])}
shutil.rmtree("img",ignore_errors=True); os.makedirs("img")
got={}
with pdfplumber.open("bank.pdf") as pdf:
    for p in pdf.pages:
        for t in p.find_tables():
            for row in t.rows:
                cells=row.cells
                if not cells[0]: continue
                txt=(p.crop(cells[0]).extract_text() or "").strip()
                if not re.fullmatch(r"\d+",txt): continue
                n=int(txt); x0,top,x1,bot=row.bbox
                has=[im for im in p.images if x0<=(im["x0"]+im["x1"])/2<=x1 and top<=(im["top"]+im["bottom"])/2<=bot]
                if not has and n not in full: continue
                ax=x0
                for c in cells:
                    if c and re.fullmatch(r"\(\s*\d\s*\)",(p.crop(c).extract_text() or "").strip()): ax=max(ax,c[2])
                if n in full:
                    bb=(ax+1,top+1,x1-1,bot-1); res=170
                else:
                    bb=(max(ax+1,min(i["x0"] for i in has)-3),max(top+1,min(i["top"] for i in has)-3),min(x1-1,max(i["x1"] for i in has)+3),min(bot-1,max(i["bottom"] for i in has)+3)); res=220
                im=p.crop(bb).to_image(resolution=res).original.convert("RGB")
                im.save(f"img/{n}.jpg",quality=85); got[n]=os.path.getsize(f"img/{n}.jpg")
print("full",len(full),sorted(full),"pics",len(got),"KB",sum(got.values())//1024)
json.dump({"imgs":sorted(got),"full":sorted(full)},open("imgset.json","w"))
