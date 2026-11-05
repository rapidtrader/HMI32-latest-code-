#!/bin/bash
# Reset HMI .env from gps-backend Mongo line + keep JWT from existing file.
set -euo pipefail

HMI_ENV="/var/www/hmi/backend/.env"
GPS_ENV="/var/www/gps-tracking/Backend/.env"

if [ ! -f "$GPS_ENV" ]; then
  echo "Missing $GPS_ENV"
  exit 1
fi

GPS_URI=$(grep '^MONGODB_URI=' "$GPS_ENV" | head -1 | cut -d= -f2- | tr -d '\r')
GPS_DB=$(grep '^MONGODB_DB_NAME=' "$GPS_ENV" | head -1 | cut -d= -f2- | tr -d '\r')
GPS_DB=${GPS_DB:-gpsDB}

JWT=$(grep '^JWT_SECRET=' "$HMI_ENV" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r')
JWT=${JWT:-CHANGE_ME}

HOST=$(echo "$GPS_URI" | sed -n 's/.*@\([^/?]*\).*/\1/p')

echo "Using Mongo host from gps-backend: $HOST"
echo "Writing clean $HMI_ENV (backup saved)"

cp -a "$HMI_ENV" "${HMI_ENV}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true

cat > "$HMI_ENV" <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=4002

MONGODB_URI=$GPS_URI
MONGODB_DB_NAME=$GPS_DB

JWT_SECRET=$JWT
JWT_EXPIRES_IN=7d

PUBLIC_APP_URL=https://hmi.dynacleanindustries.com
EOF

chmod 600 "$HMI_ENV"
echo "Done. Restart: cd /var/www/hmi/backend && pm2 restart hmi-backend --update-env"
