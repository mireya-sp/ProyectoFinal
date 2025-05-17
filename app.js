const map = new ol.Map({
  target: 'map',
  layers: [
    new ol.layer.Tile({ source: new ol.source.OSM() })
  ],
  view: new ol.View({
    center: ol.proj.fromLonLat([0.111, 38.795]),
    zoom: 12 // 🔍 Zoom más alto
  })
});

const userLocationSource = new ol.source.Vector();
const userLocationLayer = new ol.layer.Vector({ source: userLocationSource });
map.addLayer(userLocationLayer);

const infoPanel = document.getElementById('info-panel');

const vectorSource = new ol.source.Vector();
const vectorLayer = new ol.layer.Vector({ source: vectorSource });
map.addLayer(vectorLayer);

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(position => {
    userLocationSource.clear();

    const lonLat = [position.coords.longitude, position.coords.latitude];
    const coords = ol.proj.fromLonLat(lonLat);
    const accuracy = Math.round(position.coords.accuracy);

    // 🧭 Centrar el mapa en la ubicación detectada
    map.getView().animate({
      center: coords,
      zoom: 15,     // Puedes ajustar este zoom según lo que prefieras
      duration: 1000
    });

    // Radar verde de 200 metros
    const circleGeom = ol.geom.Polygon.fromCircle(new ol.geom.Circle(coords, 200));
    const radarFeature = new ol.Feature({ geometry: circleGeom });
    radarFeature.setStyle(new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(76, 175, 80, 0.2)' }),
      stroke: new ol.style.Stroke({ color: '#4CAF50', width: 2 })
    }));

    // Punto central verde
    const pointFeature = new ol.Feature({
      geometry: new ol.geom.Point(coords),
      isUser: true,
      accuracy: accuracy
    });
    pointFeature.setStyle(new ol.style.Style({
      image: new ol.style.Circle({
        radius: 6,
        fill: new ol.style.Fill({ color: '#4CAF50' }),
        stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
      })
    }));

    userLocationSource.addFeature(radarFeature);
    userLocationSource.addFeature(pointFeature);

    // Detección dentro del radar
    vectorSource.getFeatures().forEach(feature => {
      const markerCoord = feature.getGeometry().getCoordinates();
      if (circleGeom.intersectsCoordinate(markerCoord)) {
        console.log(`🟢 Estás dentro del radar de: ${feature.get('title')}`);
      }
    });
  }, error => {
    console.warn('Error al obtener ubicación:', error);
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

fetch('https://raw.githubusercontent.com/mireya-sp/ProyectoFinal/main/markers.json')
  .then(response => response.json())
  .then(markers => {
    markers.forEach(marker => {
      const feature = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat(marker.coordinates)),
        title: marker.title,
        question: marker.question,
        answers: marker.answers
      });

      feature.setStyle(new ol.style.Style({
        image: new ol.style.Icon({
          anchor: [0.5, 1],
          src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
          scale: 0.5
        }),
        text: new ol.style.Text({
          text: marker.title,
          offsetY: -35,
          font: 'bold 14px Arial',
          fill: new ol.style.Fill({ color: '#000' }),
          stroke: new ol.style.Stroke({ color: '#fff', width: 3 })
        })
      }));

      vectorSource.addFeature(feature);
    });
  });

map.on('click', function(evt) {
  const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
  if (feature) {
    if (feature.get('isUser')) {
      const accuracy = feature.get('accuracy') || '?';
      infoPanel.innerHTML = `<p>📍 Ubicación aproximada (precisión de ${accuracy} metros)</p>`;
      infoPanel.classList.remove('hidden');
      return;
    }

    const title = feature.get('title');
    const question = feature.get('question');
    const answers = feature.get('answers');

    if (title) {
      if (question && answers && answers.filter(a => a).length > 0) {
        const correct = answers[1];
        infoPanel.innerHTML = `
          <h3>${title}</h3>
          <p><strong>Pregunta:</strong> ${question}</p>
          <div class="answers">
            ${answers.filter(a => a).map(a => `
              <button class="answer-btn" data-answer="${a}">${a}</button>
            `).join('')}
          </div>
          <div id="feedback"></div>
        `;
        setTimeout(() => {
          const buttons = infoPanel.querySelectorAll('.answer-btn');
          buttons.forEach(btn => {
            btn.addEventListener('click', () => {
              buttons.forEach(b => b.disabled = true);
              if (btn.dataset.answer === correct) {
                btn.style.backgroundColor = '#4CAF50';
                infoPanel.querySelector('#feedback').textContent = '✅ ¡Correcto!';
              } else {
                btn.style.backgroundColor = '#f44336';
                infoPanel.querySelector('#feedback').textContent = '❌ Incorrecto. La correcta era: ' + correct;
              }
            });
          });
        }, 0);
      } else {
        infoPanel.innerHTML = `<h3>${title}</h3><p>Sin pregunta.</p>`;
      }
      infoPanel.classList.remove('hidden');
    }
  } else {
    infoPanel.classList.add('hidden');
  }
});
