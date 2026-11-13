#!/bin/bash
# Avoid libgomp static TLS failures when the real gst-plugin-scanner loads libav plugins (RK boards).
GOMP="/lib/aarch64-linux-gnu/libgomp.so.1"
if [ -f "$GOMP" ]; then
  case ":${LD_PRELOAD:-}:" in
    *:"$GOMP":*) ;;
    *) export LD_PRELOAD="$GOMP${LD_PRELOAD:+:$LD_PRELOAD}" ;;
  esac
fi
REAL="/usr/lib/aarch64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner"
exec "$REAL" "$@"
