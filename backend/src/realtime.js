/** Socket.IO broadcasts — set once from server.js after io is created. */
let io = null;

function setIo(serverIo) {
  io = serverIo;
}

function emitCameraVideoSerialized(video) {
  if (!io || !video?.id) return;
  io.emit('camera:video:update', {
    machineId: video.machineId,
    video,
  });
}

function emitCameraVideoUpdate(doc) {
  if (!io || !doc) return;
  let video;
  try {
    const CameraVideo = require('./models/CameraVideo');
    video = CameraVideo.serialize(doc);
  } catch {
    return;
  }
  emitCameraVideoSerialized(video);
}

function emitCameraVideoDeleted({ id, machineId }) {
  if (!io || !id) return;
  io.emit('camera:video:delete', {
    id: String(id),
    machineId: String(machineId || '').trim(),
  });
}

/** Pi → browser live JPEG preview (not stored in Mongo). */
function emitCameraLiveFrame(payload) {
  if (!io || !payload?.jpeg) return;
  const machineId = String(payload.machineId || '').trim();
  if (!machineId) return;
  io.emit('camera:live:frame', {
    machineId,
    source: String(payload.source || 'ahd').toLowerCase(),
    channel: Number(payload.channel) || 0,
    jpeg: payload.jpeg,
    width: payload.width,
    height: payload.height,
    tsEpoch: payload.tsEpoch || Date.now(),
  });
}

module.exports = {
  setIo,
  emitCameraVideoUpdate,
  emitCameraVideoSerialized,
  emitCameraVideoDeleted,
  emitCameraLiveFrame,
};
