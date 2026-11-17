import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [30.34, 76.39];
const DEFAULT_ZOOM = 14;

export default function VehicleHistoryMap({ points = [], activeIndex = 0, height = 380 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
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
    const valid = points.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
    if (!valid.length) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const trail = valid.slice(0, activeIndex + 1).map((p) => [p.latitude, p.longitude]);
    if (trail.length > 1) {
      L.polyline(trail, { color: '#7c3aed', weight: 4, opacity: 0.85 }).addTo(group);
    }

    const cur = valid[Math.min(activeIndex, valid.length - 1)];
    if (cur) {
      L.circleMarker([cur.latitude, cur.longitude], {
        radius: 10,
        color: '#5b21b6',
        weight: 3,
        fillColor: '#a78bfa',
        fillOpacity: 0.95,
      })
        .bindPopup(`${cur.latitude.toFixed(6)}, ${cur.longitude.toFixed(6)}`)
        .addTo(group);
      map.setView([cur.latitude, cur.longitude], map.getZoom() < 14 ? 14 : map.getZoom(), { animate: true });
    }
  }, [points, activeIndex]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [height, points.length]);

  return <div ref={containerRef} style={{ height, width: '100%' }} aria-label="Vehicle history map" />;
}