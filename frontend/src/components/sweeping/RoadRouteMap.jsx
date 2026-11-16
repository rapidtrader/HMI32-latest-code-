import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [28.594, 77.0255];
const DEFAULT_ZOOM = 14;

export default function RoadRouteMap({
  points = [],
  previewOn = true,
  mapClickOn = true,
  readOnly = false,
  height = 320,
  onMapClick,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const clickRef = useRef(onMapClick);
  const mapClickOnRef = useRef(mapClickOn);

  clickRef.current = onMapClick;
  mapClickOnRef.current = mapClickOn;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = group;

    map.on('click', (e) => {
      if (!clickRef.current || !mapClickOnRef.current) return;
      clickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

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
    const sorted = [...points]
      .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (!sorted.length) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const latLngs = sorted.map((p) => [Number(p.lat), Number(p.lng)]);

    sorted.forEach((p, idx) => {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: '#5b21b6',
        weight: 2,
        fillColor: '#a78bfa',
        fillOpacity: 0.9,
      });
      marker.bindPopup(`Point ${idx + 1}<br/>${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      marker.addTo(group);
    });

    if (previewOn && latLngs.length > 1) {
      L.polyline(latLngs, { color: '#6d28d9', weight: 4, opacity: 0.85 }).addTo(group);
    }

    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 17 });
  }, [points, previewOn]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (readOnly || !mapClickOn) {
      map.getContainer().style.cursor = 'default';
    } else {
      map.getContainer().style.cursor = 'crosshair';
    }
  }, [mapClickOn, readOnly]);

  return (
    <div className="sweep-road-map">
      <div
        ref={containerRef}
        className="sweep-road-map__canvas"
        style={{ height, width: '100%' }}
        aria-label="Road GPS route map"
      />
      {!readOnly && mapClickOn && (
        <p className="sweep-road-map__hint">Tap / Click on map to add GPS points</p>
      )}
    </div>
  );
}