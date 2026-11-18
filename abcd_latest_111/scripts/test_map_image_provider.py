#!/usr/bin/env python3
"""Smoke-test image provider (same as Live Map). Run on Pi after map tiles cache OK."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from PyQt5.QtGui import QGuiApplication
from app.map_tile_provider import MapTileImageProvider


def main():
  app = QGuiApplication([])
  p = MapTileImageProvider()
  result = p.requestImage("16/47102/27356", None)
  if isinstance(result, tuple) and len(result) >= 1:
    img = result[0]
  else:
    img = result
  if img is None or img.isNull():
    print("FAIL: provider returned null image", result)
    return 1
  print(f"OK provider image {img.width()}x{img.height()} (type={type(result).__name__})")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())