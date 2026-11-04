#!/bin/bash
# GStreamer forks this to scan plugins; preload libgomp before any plugin .so loads (RK3588 TLS fix).
GOMP=/lib/aarch64-linux-gnu/libgomp.so.1
if [ -f "$GOMP" ]; then
  case ":${LD_PRELOAD:-}:" in
    *":$GOMP:"*) ;;
    *)
      if [ -n "${LD_PRELOAD:-}" ]; then
        export LD_PRELOAD="$GOMP:$LD_PRELOAD"
      else
        export LD_PRELOAD="$GOMP"
      fi
      ;;
  esac
fi
REAL=/usr/lib/aarch64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner
exec "$REAL" "$@"
