/** Great-circle distance between two WGS84 points, in kilometres. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pathLengthKm(points = []) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const lat1 = Number(a.lat);
    const lon1 = Number(a.lng);
    const lat2 = Number(b.lat);
    const lon2 = Number(b.lng);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) continue;
    total += haversineKm(lat1, lon1, lat2, lon2);
  }
  return Math.round(total * 1000) / 1000;
}

function normalizeGpsPoints(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p, idx) => {
      const lat = Number(p.lat ?? p.latitude);
      const lng = Number(p.lng ?? p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return { lat, lng, order: Number(p.order ?? idx) };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
    .map((p, idx) => ({ lat: p.lat, lng: p.lng, order: idx }));
}

module.exports = { haversineKm, pathLengthKm, normalizeGpsPoints };