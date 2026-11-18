#!/usr/bin/env python3
"""Pi par Wi‑Fi test: ek tile download karo. Usage: cd abcd_latest_111 && python scripts/test_map_tile.py"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from logic.map_tile_cache import ensure_tile, CACHE_ROOT, TILE_TEMPLATE  # noqa: E402


def main():
    z, x, y = 16, 47102, 27356
    print(f"CACHE_ROOT={CACHE_ROOT}")
    print(f"TILE_TEMPLATE={TILE_TEMPLATE}")
    path = ensure_tile(z, x, y, background=False)
    if path and os.path.isfile(path) and os.path.getsize(path) > 500:
        print(f"OK tile saved: {path} ({os.path.getsize(path)} bytes)")
        return 0
    print("FAIL: tile not downloaded — check DNS, firewall, SSL, clock")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())