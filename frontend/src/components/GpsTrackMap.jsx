import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [28.594, 77.0255];
const DEFAULT_ZOOM = 14;

function validPoint(p) {
  const lat = Number(p?.latitude ?? p?.lat);
  const lng = Number(p?.longitude ?? p?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export default function GpsTrackMap({ points = [], latestId, height = 380 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const sorted = [...points].filter(validPoint).slice(0, 200);

    if (!sorted.length) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const latLngs = [];
    sorted.forEach((p) => {
      const lat = Number(p.latitude ?? p.lat);
      const lng = Number(p.longitude ?? p.lng);
      latLngs.push([lat, lng]);

      const isLatest = latestId && p.id === latestId;
      const marker = L.circleMarker([lat, lng], {
        radius: isLatest ? 9 : 5,
        color: isLatest ? '#7c3aed' : '#2563eb',
        weight: isLatest ? 3 : 1,
        fillColor: isLatest ? '#a78bfa' : '#60a5fa',
        fillOpacity: 0.85,
      });
      const time = p.recorded_at ? new Date(p.recorded_at).toLocaleString() : '—';
      marker.bindPopup(
        `<strong>${p.deviceId || 'GPS'}</strong><br/>${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>${time}<br/>Speed: ${Number(p.speed ?? 0).toFixed(1)} km/h`
      );
      marker.addTo(group);
    });

    if (latLngs.length > 1) {
      const chronological = [...sorted]
        .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
        .map((p) => [Number(p.latitude ?? p.lat), Number(p.longitude ?? p.lng)]);
      L.polyline(chronological, {
        color: '#6366f1',
        weight: 3,
        opacity: 0.75,
        dashArray: latLngs.length > 80 ? '4 6' : null,
      }).addTo(group);
    }

    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });
  }, [points, latestId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [points.length, height]);

  return (
    <div className="hmi32-gps-map-wrap">
      <div
        ref={containerRef}
        className="hmi32-gps-map"
        style={{ height, width: '100%', borderRadius: '0 0 8px 8px' }}
        aria-label="GPS track map"
      />
      <p className="hmi32-gps-map-legend">
        <span className="hmi32-gps-map-legend__dot hmi32-gps-map-legend__dot--trail" /> Track points
        <span className="hmi32-gps-map-legend__dot hmi32-gps-map-legend__dot--live" /> Latest fix
      </p>
    </div>
  );
}
