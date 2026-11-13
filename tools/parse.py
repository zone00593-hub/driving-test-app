import pdfplumber, re, json
FW=str.maketrans("０１２３４５６７８９（）","0123456789()")
qs=[]; cur=None; cat=None
with pdfplumber.open("bank.pdf") as pdf:
    for pi,p in enumerate(pdf.pages):
        for tb in p.extract_tables():
            for row in tb:
                cells=[(c or "").replace("\n","").strip() for c in row]
                if not any(cells): continue
                if "題號" in cells[0] or cells[0] in ("",) and cells[2:3]==["案"]: continue
                num=cells[0]
                am=[c for c in cells[1:4] if re.fullmatch(r"\(\d\)",c)]
                rest=[c for c in cells[2:] if c and not re.fullmatch(r"\(\d\)",c)]
                text=rest[-1] if rest else ""
                if re.fullmatch(r"\d+",num):
                    m=re.search(r"\((\d)\)",am[0]) if am else None
                    cur={"no":int(num),"ans":int(m.group(1)) if m else 0,"raw":text,"page":pi+1}
                    qs.append(cur)
                elif text and cur and "題 目" not in text and text!="案":
                    cur["raw"]+=text
json.dump(qs,open("raw.json","w"),ensure_ascii=False)
print(len(qs), qs[0]["no"], qs[-1]["no"])
nos=[q["no"] for q in qs]
print("dups",len(nos)-len(set(nos)),"missing",[n for n in range(1,max(nos)+1) if n not in set(nos)][:50])
