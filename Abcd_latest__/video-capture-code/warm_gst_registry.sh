#!/bin/bash
# Lightweight: set env only. Full gst-inspect warm can deadlock if a scanner is already stuck.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WRAPPER="$DIR/gst-plugin-scanner-wrapper.sh"
chmod +x "$WRAPPER" 2>/dev/null || true

export GST_PLUGIN_SCANNER="$WRAPPER"
export GST_REGISTRY_UPDATE="${GST_REGISTRY_UPDATE:-no}"
GOMP="/lib/aarch64-linux-gnu/libgomp.so.1"
if [ -f "$GOMP" ]; then
  export LD_PRELOAD="$GOMP${LD_PRELOAD:+:$LD_PRELOAD}"
fi

echo "[warm_gst] env ready (GST_PLUGIN_SCANNER + LD_PRELOAD). Use reset_gst_stuck.sh if scanners hang."
