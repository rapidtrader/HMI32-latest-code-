#!/bin/bash
# Shared GStreamer env for RK3588 (source from other scripts).
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
export GST_REGISTRY_UPDATE="${GST_REGISTRY_UPDATE:-no}"
export DISPLAY="${DISPLAY:-:0}"

_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_WRAPPER="$_DIR/gst-plugin-scanner-wrapper.sh"
if [ -x "$_WRAPPER" ]; then
  export GST_PLUGIN_SCANNER="$_WRAPPER"
fi
unset _DIR _WRAPPER
