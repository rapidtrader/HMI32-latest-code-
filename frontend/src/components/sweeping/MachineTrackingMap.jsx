import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [28.594, 77.0255];
const DEFAULT_ZOOM = 12;

export default function MachineTrackingMap({ machines = [], focusId, height = 380 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const focusRef = useRef(focusId);

  focusRef.current = focusId;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(
      DEFAULT_CENTER,
      DEFAULT_ZOOM,
    );

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
    const points = machines.filter(
      (m) => Number.isFinite(m.latitude) && Number.isFinite(m.longitude),
    );

    if (!points.length) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const latLngs = [];

    points.forEach((m) => {
      const lat = Number(m.latitude);
      const lng = Number(m.longitude);
      latLngs.push([lat, lng]);
      const isFocus = focusRef.current && m.machineId === focusRef.current;
      const marker = L.circleMarker([lat, lng], {
        radius: isFocus ? 11 : 8,
        color: isFocus ? '#5b21b6' : '#2563eb',
        weight: isFocus ? 3 : 2,
        fillColor: isFocus ? '#a78bfa' : '#60a5fa',
        fillOpacity: 0.95,
      });
      marker.bindPopup(
        `<strong>${m.machineId}</strong><br/>${m.machineName || ''}<br/>${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      );
      marker.addTo(group);
    });

    if (focusRef.current) {
      const f = points.find((m) => m.machineId === focusRef.current);
      if (f) {
        map.setView([f.latitude, f.longitude], 16, { animate: true });
        return;
      }
    }

    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  }, [machines, focusId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [height, machines.length]);

  return (
    <div className="sweep-machine-map">
      <div ref={containerRef} className="sweep-machine-map__canvas" style={{ height, width: '100%' }} />
    </div>
  );
}