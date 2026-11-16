import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [28.594, 77.0255];
const DEFAULT_ZOOM = 12;

export default function PlanVsActualMap({ plannedPolylines = [], actualTrack = [], height = 340 }) {
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
    const latLngs = [];

    for (const line of plannedPolylines) {
      const pts = line
        .map((p) => [Number(p.lat), Number(p.lng)])
        .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));
      if (pts.length > 1) {
        L.polyline(pts, { color: '#6d28d9', weight: 4, opacity: 0.85, dashArray: '8 6' }).addTo(group);
        pts.forEach((p) => latLngs.push(p));
      }
    }

    const actual = actualTrack
      .map((p) => [Number(p.lat), Number(p.lng)])
      .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));

    if (actual.length > 1) {
      L.polyline(actual, { color: '#16a34a', weight: 3, opacity: 0.9 }).addTo(group);
      actual.forEach((p) => latLngs.push(p));
    } else if (actual.length === 1) {
      L.circleMarker(actual[0], { radius: 7, color: '#16a34a', fillOpacity: 0.9 }).addTo(group);
      latLngs.push(actual[0]);
    }

    if (!latLngs.length) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    map.fitBounds(L.latLngBounds(latLngs), { padding: [32, 32], maxZoom: 16 });
  }, [plannedPolylines, actualTrack]);

  return (
    <div className="sweep-pva-legend-wrap">
      <div ref={containerRef} style={{ height, width: '100%' }} />
      <p className="sweep-pva-legend">
        <span className="sweep-pva-legend__planned" /> Planned route
        <span className="sweep-pva-legend__actual" /> Actual GPS track
      </p>
    </div>
  );
}