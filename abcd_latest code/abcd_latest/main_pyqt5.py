#!/usr/bin/env python3
"""DYNACLEAN EV Sweeper HMI — PyQt5 + QML entry point."""

import os
import sys

os.environ.setdefault("GPS_SERIAL_PORT", "/dev/ttyUSB1")
os.environ.setdefault("GPS_BAUD", "115200")

# Fix Rockchip / OpenGL crash
os.environ["QT_QPA_PLATFORM"] = "xcb"
os.environ["QT_XCB_GL_INTEGRATION"] = "none"
os.environ["QT_OPENGL"] = "software"
os.environ["QT_QUICK_BACKEND"] = "software"
os.environ["LIBGL_ALWAYS_SOFTWARE"] = "1"
os.environ["QT_QUICK_CONTROLS_STYLE"] = "Basic"
os.environ["QT_DEBUG_PLUGINS"] = "0"

from app.bootstrap import run

if __name__ == "__main__":
    sys.exit(run() or 0)