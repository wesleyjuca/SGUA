// SGUA — Mapa Leaflet (iframe isolado)

function buildMapHtml(units, opts) {
  opts = opts || {};
  var compact = !!opts.compact;
  var singleUnit = opts.singleUnit || null;
  var center = opts.center || [-9.0, -70.0];
  var zoom = opts.zoom || (compact ? 6 : 7);

  var validUnits = (units || []).filter(function(u) {
    var lat = u.lat || (u.coords && u.coords.lat);
    var lng = u.lng || (u.coords && u.coords.lng);
    return lat && lng && !isNaN(lat) && !isNaN(lng);
  });

  if (singleUnit) {
    validUnits = [singleUnit];
    center = [(singleUnit.lat || singleUnit.coords.lat), (singleUnit.lng || singleUnit.coords.lng)];
    zoom = 13;
  }

  var geoJsonFeatures = validUnits.map(function(u) {
    var lat = u.lat || (u.coords && u.coords.lat);
    var lng = u.lng || (u.coords && u.coords.lng);
    var cor = u.tipo === 'CIMA' ? '#0F5C3A' : '#1565A8';
    var sts = u.status === 'inativo' ? '#A32D2D' : u.status === 'manutencao' ? '#C4832A' : cor;
    return {
      type: 'Feature',
      properties: { id: u.id, nome: u.nome, tipo: u.tipo, municipio: u.municipio, status: u.status, taxa_uso: u.taxa_uso || u.taxaUso || 0, ocupacao: u.ocupacaoAtual || 0, cor: sts },
      geometry: { type: 'Point', coordinates: [lng, lat] }
    };
  });

  var geojsonStr = JSON.stringify({ type: 'FeatureCollection', features: geoJsonFeatures });

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/>' +
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>' +
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css"/>' +
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css"/>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box}html,body,#map{height:100%;width:100%;}</style>' +
    '</head><body><div id="map"></div>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js"></script>' +
    '<script>' +
    'var map=L.map("map",{zoomControl:true}).setView(' + JSON.stringify(center) + ',' + zoom + ');' +
    'L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(map);' +
    'var cluster=L.markerClusterGroup();' +
    'var geojson=' + geojsonStr + ';' +
    'geojson.features.forEach(function(f){' +
    '  var p=f.properties,c=f.geometry.coordinates;' +
    '  var ic=L.divIcon({className:"",html:\'<div style="background:\'+p.cor+\';width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>\',iconSize:[16,16],iconAnchor:[8,8]});' +
    '  var mk=L.marker([c[1],c[0]],{icon:ic});' +
    '  mk.bindPopup(\'<b>\'+p.nome+\'</b><br>Tipo: \'+p.tipo+\'<br>Município: \'+p.municipio+\'<br>Status: \'+p.status+\'<br>Uso: \'+p.taxa_uso+\'%\');' +
    '  cluster.addLayer(mk);' +
    '});' +
    'map.addLayer(cluster);' +
    '</script></body></html>';
}

function MapView(props) {
  var units = props.units || [];
  var compact = !!props.compact;
  var singleUnit = props.singleUnit || null;
  var height = props.height || (compact ? 280 : 520);

  var key = React.useMemo(function() {
    return (singleUnit ? 'u' + singleUnit.id : 'all') + '_' + units.length;
  }, [units.length, singleUnit]);

  var html = React.useMemo(function() {
    return buildMapHtml(units, { compact: compact, singleUnit: singleUnit });
  }, [key]);

  return React.createElement('iframe', {
    key: key,
    srcDoc: html,
    style: { width:'100%', height:height, border:'none', borderRadius:12 },
    title: 'Mapa CIMA/UGAI',
    loading: 'lazy'
  });
}
