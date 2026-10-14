#!/usr/bin/env python3
"""Generate app/icons/*.png and icon.svg locally (stdlib only). Run: python3 tools/make_icons.py"""
import struct, zlib, os
out = os.path.join(os.path.dirname(__file__), "..", "app", "icons")
os.makedirs(out, exist_ok=True)
BG, LIGHT, DARK, DOT = (38, 36, 33), (240, 217, 181), (181, 136, 99), (46, 158, 68)

def png(size, maskable):
    pad = 0.18 if maskable else 0.08          # maskable keeps content inside the safe zone
    lo, hi = size * pad, size * (1 - pad)
    cell = (hi - lo) / 4
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            c = BG
            if lo <= x < hi and lo <= y < hi:
                i, j = int((x - lo) / cell), int((y - lo) / cell)
                c = LIGHT if (i + j) % 2 == 0 else DARK
                cx, cy = lo + 2.5 * cell, lo + 1.5 * cell
                if (x - cx) ** 2 + (y - cy) ** 2 < (cell * 0.32) ** 2:
                    c = DOT
            row += bytes(c)
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(t, d):
        b = t + d
        return struct.pack(">I", len(d)) + b + struct.pack(">I", zlib.crc32(b))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

for name, size, m in [("icon-180.png", 180, False), ("icon-192.png", 192, False), ("icon-512.png", 512, False),
                      ("icon-maskable-512.png", 512, True)]:
    open(os.path.join(out, name), "wb").write(png(size, m))

cells = "".join(f'<rect x="{12+i*20}" y="{12+j*20}" width="20" height="20" fill="{"#f0d9b5" if (i+j)%2==0 else "#b58863"}"/>' for i in range(4) for j in range(4))
open(os.path.join(out, "icon.svg"), "w").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 104"><rect width="104" height="104" fill="#262421"/>{cells}<circle cx="62" cy="42" r="6.4" fill="#2e9e44"/></svg>\n')
