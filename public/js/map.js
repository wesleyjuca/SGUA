// SGUA — Componente Leaflet (global namespace)

var MapaLeaflet = function(props) {
  var uns = props.uns || [];
  var height = props.height || 480;
  var onSelect = props.onSelect;
  var filterTipo = props.filterTipo || null;

  var containerRef = React.useRef(null);
  var mapRef = React.useRef(null);
  var markersRef = React.useRef(null);

  React.useEffect(function() {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    var map = L.map(containerRef.current, {
      center: [-9.97, -67.81],
      zoom: 7,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18
    }).addTo(map);

    mapRef.current = map;

    return function() {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  React.useEffect(function() {
    var map = mapRef.current;
    if (!map) return;

    if (markersRef.current) {
      markersRef.current.clearLayers();
    } else {
      markersRef.current = L.markerClusterGroup ? L.markerClusterGroup() : L.layerGroup();
      map.addLayer(markersRef.current);
    }

    var filtered = filterTipo ? uns.filter(function(u) {
      if (filterTipo === 'CIMA') return !/^UGAI/i.test(u.name || u.nome || '');
      if (filterTipo === 'UGAI') return /^UGAI/i.test(u.name || u.nome || '');
      return true;
    }) : uns;

    filtered.forEach(function(u) {
      var lat = u.latitude ?? (u.coords && u.coords.lat) ?? null;
      var lng = u.longitude ?? (u.coords && u.coords.lng) ?? null;
      if (!lat || !lng) return;

      var isAtivo = u.status === 'active' || u.status === 'ativo';
      var nome = u.name || u.nome || 'Unidade';

      var icon = L.divIcon({
        className: '',
        html: '<div style="width:28px;height:28px;border-radius:50%;background:' + (isAtivo ? '#22a86a' : '#9ca3af') + ';border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;font-weight:700;">' + (/^UGAI/i.test(nome) ? 'U' : 'C') + '</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      var taxaUso = u.capacity > 0 ? Math.round(((u.current_occupancy || u.ag || 0) / u.capacity) * 100) : 0;

      var popup = L.popup({ maxWidth: 260 }).setContent(
        '<div style="font-family:inherit;min-width:180px;">' +
        '<strong style="font-size:14px;">' + (nome) + '</strong>' +
        '<div style="margin:4px 0;font-size:12px;color:#5f6b76;">' + (u.address || u.municipio || '') + '</div>' +
        '<div style="margin-top:6px;display:flex;gap:8px;font-size:12px;">' +
        '<span style="background:' + (isAtivo ? '#dcfce7' : '#f3f4f6') + ';color:' + (isAtivo ? '#166534' : '#374151') + ';padding:2px 8px;border-radius:99px;font-weight:600;">' + (isAtivo ? 'Ativa' : 'Inativa') + '</span>' +
        (u.capacity > 0 ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:99px;font-weight:600;">' + taxaUso + '% uso</span>' : '') +
        '</div>' +
        (u.description || u.descricao ? '<div style="margin-top:6px;font-size:12px;color:#374151;">' + (u.description || u.descricao || '').slice(0, 100) + '</div>' : '') +
        (onSelect ? '<div style="margin-top:8px;"><button onclick="window.__sgua_map_select__(' + (u.id) + ')" style="font-size:12px;padding:4px 10px;background:#22a86a;color:#fff;border:none;border-radius:6px;cursor:pointer;">Ver detalhes</button></div>' : '') +
        '</div>'
      );

      var marker = L.marker([lat, lng], { icon: icon }).bindPopup(popup);
      if (markersRef.current) markersRef.current.addLayer(marker);
    });

    if (onSelect) {
      window.__sgua_map_select__ = onSelect;
    }
  }, [uns, filterTipo, onSelect]);

  return h('div', { ref: containerRef, style: { height: height, borderRadius: 12, overflow: 'hidden', zIndex: 1 } });
};
