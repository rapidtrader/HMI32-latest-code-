#!/bin/bash
# Compare HMI vs gps-backend Mongo settings (no secrets printed).
set -euo pipefail

HMI_ENV="/var/www/hmi/backend/.env"
GPS_ENV="/var/www/gps-tracking/Backend/.env"

host_from_uri() {
  sed -n 's/^MONGODB_URI=.*@\([^/?]*\).*/\1/p' "$1" | head -1
}

echo "=== HMI .env ==="
if [ -f "$HMI_ENV" ]; then
  echo "  file: $HMI_ENV"
  echo "  host: $(host_from_uri "$HMI_ENV")"
  echo "  db:   $(grep '^MONGODB_DB_NAME=' "$HMI_ENV" | head -1 | cut -d= -f2)"
else
  echo "  MISSING $HMI_ENV"
fi

echo ""
echo "=== gps-backend .env ==="
if [ -f "$GPS_ENV" ]; then
  echo "  file: $GPS_ENV"
  echo "  host: $(host_from_uri "$GPS_ENV")"
  echo "  db:   $(grep '^MONGODB_DB_NAME=' "$GPS_ENV" | head -1 | cut -d= -f2)"
else
  echo "  MISSING $GPS_ENV"
fi

echo ""
echo "=== PM2 node version ==="
pm2 describe hmi-backend 2>/dev/null | awk '/interpreter version/{print "  hmi-backend:", $0}' || true
pm2 describe gps-backend 2>/dev/null | awk '/interpreter version/{print "  gps-backend:", $0}' || true

echo ""
HMI_H=$(host_from_uri "$HMI_ENV" 2>/dev/null || true)
GPS_H=$(host_from_uri "$GPS_ENV" 2>/dev/null || true)
if [ -n "$HMI_H" ] && [ -n "$GPS_H" ] && [ "$HMI_H" != "$GPS_H" ]; then
  echo ">>> Hosts DIFFER — HMI should use the same MONGODB_URI as gps-backend if they share gpsDB:"
  echo "    sudo cp -a \"$GPS_ENV\" /tmp/gps.env.sample"
  echo "    grep MONGODB_URI \"$GPS_ENV\"   # copy this line into $HMI_ENV"
elif [ "$HMI_H" = "$GPS_H" ]; then
  echo ">>> Same Atlas host. If gps works but HMI fails, run:"
  echo "    cd /var/www/gps-tracking/Backend && node -e \"require('dotenv').config();const {MongoClient}=require('mongodb');const c=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000,autoSelectFamily:false});c.connect().then(()=>{console.log('gps folder OK');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})\""
  echo "    NODE_OPTIONS=--dns-result-order=ipv4first node /var/www/hmi/backend/scripts/test-mongo-connect.js"
fi

echo ""
echo "=== PM2 restart HMI (needs ecosystem for NODE_OPTIONS) ==="
echo "    cd /var/www/hmi/backend && pm2 delete hmi-backend; pm2 start ecosystem.config.cjs && pm2 save"
