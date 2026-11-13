#!/usr/bin/env python3
"""把 src/data/bank.json 逐題對照官方 PDF，用「另一種」抽取方式獨立核對。

bank.json 是用 pdfplumber 的表格抽取產生的（見 parse.py、split.py）。
這支腳本改用 pdftotext 的純文字輸出來核對，兩種方法互相獨立：
  1. 答案：從版面文字裡找「題號 (答案)」的組合，和 bank.json 的答案比對。
  2. 文字：題幹與三個選項去掉空白後，必須原樣出現在 PDF 的文字裡。

用法：python3 tools/verify_bank.py 路徑/題庫.pdf
需要：poppler-utils（pdftotext）。PDF 請自行從公路局網站下載，不要放進 repo。
"""
import json, re, subprocess, sys, unicodedata
from pathlib import Path

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)          # 全形數字與括號 → 半形
    return re.sub(r"\s+", "", s)

def main(pdf: str) -> int:
    bank = json.loads((Path(__file__).resolve().parent.parent / "src/data/bank.json").read_text(encoding="utf-8"))
    layout = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    raw = subprocess.run(["pdftotext", "-raw", pdf, "-"], capture_output=True, text=True, check=True).stdout
    # 每頁開頭的頁首（「新版汽車筆試題庫 115.5.29」「第 N 頁」）會插在跨頁題目的文字中間，先拿掉。
    def strip_headers(t: str) -> str:
        keep = [ln for ln in t.replace("\f", "\n").splitlines()
                if not re.fullmatch(r"\s*(新版汽車筆試題庫\s*[\d.]+|第\s*\d+\s*頁)\s*", ln)]
        return "\n".join(keep)
    haystacks = [norm(strip_headers(layout)), norm(strip_headers(raw))]

    # 1) 答案：版面文字中，每一題的題號與答案在同一行，例如「  38   (2) ……」。
    found = {}
    for line in layout.splitlines():
        m = re.match(r"^\s*(\d{1,4})\s+\(([123])\)", unicodedata.normalize("NFKC", line))
        if m:
            found.setdefault(int(m.group(1)), set()).add(int(m.group(2)))
    ans_ok = ans_bad = ans_missing = 0
    bad = []
    for q in bank:
        got = found.get(q["n"])
        if not got:
            ans_missing += 1
        elif got == {q["a"]}:
            ans_ok += 1
        else:
            ans_bad += 1; bad.append((q["n"], q["a"], sorted(got)))

    # 2) 文字：題幹與選項必須出現在 PDF 文字裡。
    text_ok = 0; text_bad = []
    for q in bank:
        parts = [q["q"]] + ([] if q.get("full") else q["o"])
        missing = [p for p in parts if p.strip() and not any(norm(p) in h for h in haystacks)]
        if missing: text_bad.append((q["n"], missing[0][:30]))
        else: text_ok += 1

    print(f"題數：{len(bank)}")
    print(f"答案核對：一致 {ans_ok}、不一致 {ans_bad}、版面文字中找不到該行 {ans_missing}")
    for n, a, got in bad[:20]: print(f"  ✗ #{n}: bank.json={a}，PDF 版面文字={got}")
    print(f"文字核對：題幹與選項皆出現在 PDF 中 {text_ok} 題、有片段對不上 {len(text_bad)} 題")
    for n, frag in text_bad[:20]: print(f"  ? #{n}: 「{frag}…」")
    return 1 if ans_bad else 0

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__); sys.exit(2)
    sys.exit(main(sys.argv[1]))
