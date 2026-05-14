"""Run once: python3 make_icons.py  — generates placeholder PNG icons."""
import struct, zlib, os

os.makedirs("icons", exist_ok=True)

def make_png(size):
    w = h = size
    raw = b""
    for y in range(h):
        row = b"\x00"
        for x in range(w):
            margin = max(1, size // 6)
            corner = (
                (x < margin and y < margin)
                or (x < margin and y >= h - margin)
                or (x >= w - margin and y < margin)
                or (x >= w - margin and y >= h - margin)
            )
            row += bytes([0, 0, 0, 0]) if corner else bytes([37, 99, 235, 255])
        raw += row
    compressed = zlib.compress(raw)

    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )

for size, name in [(16, "icon16"), (48, "icon48"), (128, "icon128")]:
    path = f"icons/{name}.png"
    with open(path, "wb") as f:
        f.write(make_png(size))
    print(f"✅ {path}")
