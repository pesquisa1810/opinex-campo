"""Conta operações de desenho vetorial (retângulos e preenchimentos) num PDF gerado pelo jsPDF."""
import re, sys, zlib
data = open(sys.argv[1], 'rb').read()
ops = 0
for m in re.finditer(rb'stream\r?\n(.*?)\r?\nendstream', data, re.S):
    raw = m.group(1)
    try:
        raw = zlib.decompress(raw)
    except Exception:
        pass
    ops += len(re.findall(rb'(?m)(?:\bre\b|\bf\b|\bf\*)\s*$', raw))
print(ops)
