import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [30.59, 76.35];
const DEFAULT_ZOOM = 7;

const STATUS_COLOR = {
  RUNNING: '#22c55e',
  STOPPED: '#ef4444',
  OVERSPEED: '#f97316',
  IDLE: '#eab308',
  UNREACHABLE: '#38bdf8',
  NEW: '#94a3b8',
  INACTIVE: '#1f2937',
};

export default function FleetLiveMap({ vehicles = [], focusId, showMarkers = true, height = '100%' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const focusRef = useRef(focusId);

  focusRef.current = focusId;

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
    if (!showMarkers) return;

    const pts = vehicles.filter((v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude));
    if (!pts.length) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const latLngs = [];
    pts.forEach((v) => {
      const lat = Number(v.latitude);
      const lng = Number(v.longitude);
      latLngs.push([lat, lng]);
      const color = STATUS_COLOR[v.status] || '#6366f1';
      const focused = focusRef.current && v.deviceId === focusRef.current;
      const marker = L.circleMarker([lat, lng], {
        radius: focused ? 12 : 9,
        color: focused ? '#5b21b6' : color,
        weight: focused ? 3 : 2,
        fillColor: color,
        fillOpacity: 0.92,
      });
      const alt = Number(v.altitude ?? 0);
      const sats = v.satellites != null ? v.satellites : '—';
      const mid = v.machineId || v.deviceId;
      const title = v.clientName || v.machineName || mid;
      marker.bindPopup(
        `<strong>Machine ID:</strong> ${mid}<br/><strong>${title}</strong>${
          v.vehiclePlateNo ? `<br/>Plate: ${v.vehiclePlateNo}` : ''
        }${v.location ? `<br/>${v.location}` : ''}<br/>${v.status} · ${v.speedKmh} km/h<br/>Alt ${alt.toFixed(0)} m · Sats ${sats}`,
      );
      marker.addTo(group);

      if (focused) {
        L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'fleet-map-label',
            html: `<span>${v.clientName || v.machineId || v.deviceId}</span><small>${v.machineId || v.deviceId}</small>`,
            iconAnchor: [20, -8],
          }),
        }).addTo(group);
      }
    });

    if (focusRef.current) {
      const f = pts.find((v) => v.deviceId === focusRef.current);
      if (f) {
        map.setView([f.latitude, f.longitude], 14, { animate: true });
        return;
      }
    }

    map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 12 });
  }, [vehicles, focusId, showMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [vehicles.length, showMarkers]);

  return (
    <div className="fleet-live-map" style={{ height }}>
      <div ref={containerRef} className="fleet-live-map__canvas" style={{ height: '100%', width: '100%' }} />
    </div>
  );
}