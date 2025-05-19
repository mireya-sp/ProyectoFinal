function normalize(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const map = new ol.Map({
  target: 'map',
  layers: [
    new ol.layer.Tile({ source: new ol.source.OSM() })
  ],
  view: new ol.View({
    center: ol.proj.fromLonLat([0.111, 38.795]),
    zoom: 12
  })
});

const userLocationSource = new ol.source.Vector();
const userLocationLayer = new ol.layer.Vector({ source: userLocationSource });
map.addLayer(userLocationLayer);

const vectorSource = new ol.source.Vector();
const vectorLayer = new ol.layer.Vector({ source: vectorSource });
map.addLayer(vectorLayer);

const infoPanel = document.getElementById('info-panel');
const citySelect = document.getElementById('city-select');
const counterDisplay = document.getElementById('counter');
const bypassCheckbox = document.getElementById('bypass-geo');

let totalQuestions = 0;
let correctAnswers = 0;
let currentRadarGeometry = null;

function updateCounter() {
  counterDisplay.textContent = `${correctAnswers}/${totalQuestions}`;
}

citySelect.addEventListener('change', () => {
  const selectedCity = citySelect.value;
  if (!selectedCity) return;
  const url = `https://raw.githubusercontent.com/mireya-sp/marcadores/main/${selectedCity}.json`;

  vectorSource.clear();
  totalQuestions = 0;
  correctAnswers = 0;
  updateCounter();
  infoPanel.classList.add('hidden');

  fetch(url)
    .then(res => res.json())
    .then(markers => {
      markers.forEach(marker => {
        const correct = marker.answers?.[marker.correctAnswerIndex] || '';
        const feature = new ol.Feature({
          geometry: new ol.geom.Point(ol.proj.fromLonLat(marker.coordinates)),
          title: marker.title,
          question: marker.question,
          answers: marker.answers,
          correctAnswer: correct,
          locked: false
        });

        if (marker.question && typeof marker.correctAnswerIndex === 'number') {
          totalQuestions++;
        }

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

      updateCounter();
    });
});

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(position => {
    userLocationSource.clear();

    const lonLat = [position.coords.longitude, position.coords.latitude];
    const coords = ol.proj.fromLonLat(lonLat);
    const accuracy = Math.round(position.coords.accuracy);

    map.getView().animate({
      center: coords,
      zoom: 15,
      duration: 1000
    });

    const circleGeom = ol.geom.Polygon.fromCircle(new ol.geom.Circle(coords, 200));
    currentRadarGeometry = circleGeom;

    const radarFeature = new ol.Feature({
      geometry: circleGeom,
      isRadar: true
    });
    radarFeature.setStyle(new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(76, 175, 80, 0.2)' }),
      stroke: new ol.style.Stroke({ color: '#4CAF50', width: 2 })
    }));

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
  }, error => {
    console.warn('Error al obtener ubicación:', error);
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

map.on('click', function(evt) {
  const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
  if (feature) {
    if (feature.get('isRadar')) return;

    if (feature.get('isUser')) {
      const accuracy = feature.get('accuracy') || '?';
      infoPanel.innerHTML = `<p>📍 Ubicación aproximada (precisión de ${accuracy} metros)</p>`;
      infoPanel.classList.remove('hidden');
      return;
    }

    const title = feature.get('title');
    const question = feature.get('question');
    const answers = feature.get('answers');
    const correct = feature.get('correctAnswer');
    const locked = feature.get('locked') === true;
    const bypass = bypassCheckbox?.checked;
    const coord = feature.getGeometry().getCoordinates();

    if (!bypass && (!currentRadarGeometry || !currentRadarGeometry.intersectsCoordinate(coord))) {
      infoPanel.innerHTML = `
        <h3>${title || 'Marcador'}</h3>
        <p>🚫 Estás demasiado lejos de este punto.</p>
      `;
      infoPanel.classList.remove('hidden');
      return;
    }

    if (title && question && Array.isArray(answers) && answers.length > 0) {
      if (locked) return;

      infoPanel.innerHTML = `
        <h3>${title}</h3>
        <p><strong>Pregunta:</strong> ${question}</p>
        <div class="answers">
          ${answers.map(a => `
            <button class="answer-btn" data-answer="${a}">${a}</button>
          `).join('')}
        </div>
        <div id="feedback"></div>
      `;
      infoPanel.classList.remove('hidden');
    } else {
      infoPanel.innerHTML = `<h3>${title}</h3><p>Sin pregunta.</p>`;
      infoPanel.classList.remove('hidden');
    }

    infoPanel.onclick = (e) => {
      const btn = e.target.closest('.answer-btn');
      if (!btn) return;

      if (feature.get('locked')) return;

      const respuesta = btn.dataset.answer;
      const normalUser = normalize(respuesta);
      const normalCorrect = normalize(correct || '');

      if (normalUser === normalCorrect) {
        btn.style.backgroundColor = '#4CAF50';
        infoPanel.querySelector('#feedback').textContent = '✅ ¡Correcto!';
        feature.set('locked', true);
        correctAnswers++;
        updateCounter();

        feature.setStyle(new ol.style.Style({
          image: new ol.style.Icon({
            anchor: [0.5, 1],
            src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
            scale: 0.5
          }),
          text: new ol.style.Text({
            text: feature.get('title'),
            offsetY: -35,
            font: 'bold 14px Arial',
            fill: new ol.style.Fill({ color: '#000' }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 3 })
          })
        }));

        infoPanel.querySelectorAll('.answer-btn').forEach(b => b.disabled = true);
        setTimeout(() => {
          infoPanel.classList.add('hidden');
        }, 1500);
      } else {
        btn.style.backgroundColor = '#f44336';
        infoPanel.querySelector('#feedback').textContent = '❌ Incorrecto. Vuelve a intentarlo.';
        btn.disabled = true;
      }
    };
  } else {
    infoPanel.classList.add('hidden');
  }
});
