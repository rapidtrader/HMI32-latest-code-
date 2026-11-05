/** PM2: cd /var/www/hmi/backend && pm2 start ecosystem.config.cjs && pm2 save */
module.exports = {
  apps: [
    {
      name: 'hmi-backend',
      cwd: '/var/www/hmi/backend',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--dns-result-order=ipv4first',
        PORT: 4002,
        HOST: '0.0.0.0',
        FFMPEG_PATH: '/usr/bin/ffmpeg',
      },
    },
  ],
};
