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
        CAMERA_VIDEO_DIRECT_SLOT: '1',
        CAMERA_VIDEO_ASYNC_MERGE: '0',
        CAMERA_VIDEO_MERGE_DEBOUNCE_MS: '450',
        CAMERA_VIDEO_MERGE_BATCH: '10',
        CAMERA_VIDEO_FASTSTART_MAX_MB: '64',
        CAMERA_VIDEO_GRIDFS_DELETE_DELAY_MS: '180000',
        CAMERA_VIDEO_SLOW_POST_MS: '15000',
        MONGODB_SERVER_SELECTION_TIMEOUT_MS: '20000',
        MONGODB_SOCKET_TIMEOUT_MS: '600000',
      },
    },
  ],
};
