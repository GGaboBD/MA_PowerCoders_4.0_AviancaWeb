const routeNames = { BOG: 'Bogotá', MDE: 'Medellín', CLO: 'Cali', CTG: 'Cartagena' };
const schedule = [
  { time: '07:20', number: 'AV 8402', cabin: 'ejecutiva', price: 420000 },
  { time: '11:45', number: 'AV 8418', cabin: 'primera', price: 890000 },
  { time: '16:10', number: 'AV 8436', cabin: 'ejecutiva', price: 465000 },
  { time: '19:35', number: 'AV 8451', cabin: 'primera', price: 940000 }
];
const form = document.querySelector('#formulario-busqueda');
const dateField = form.elements.fecha;
const today = new Date();
const localISODate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
dateField.min = localISODate;
dateField.value = localISODate;
form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  const origin = data.get('origen'), destination = data.get('destino');
  const results = document.querySelector('#resultados');
  results.hidden = false;
  if (origin === destination) {
    results.innerHTML = '<p class="mensaje-busqueda">El origen y el destino deben ser diferentes.</p>';
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const flights = schedule.filter(f => f.time >= data.get('hora') && f.cabin === data.get('cabina'));
  const route = `${routeNames[origin]} → ${routeNames[destination]}`;
  const cabinLabel = data.get('cabina') === 'primera' ? 'Primera clase' : 'Clase ejecutiva';
  if (!flights.length) {
    results.innerHTML = `<div class="resultados-titulo"><p class="etiqueta">RESULTADOS</p><h2>${route}</h2><p>No encontramos salidas de ${cabinLabel.toLowerCase()} a partir de esa hora. Prueba con otra hora.</p></div>`;
  } else {
    const query = new URLSearchParams({ origen: origin, destino: destination, fecha: data.get('fecha'), hora: '', cabina: data.get('cabina'), pasajeros: data.get('pasajeros') });
    results.innerHTML = `<div class="resultados-titulo"><p class="etiqueta">VUELOS DISPONIBLES · ${data.get('fecha')}</p><h2>${route}</h2><p>${cabinLabel} · ${data.get('pasajeros')} pasajero${data.get('pasajeros') === '1' ? '' : 's'}</p></div><div class="lista-vuelos">${flights.map(f => { query.set('hora', f.time); query.set('vuelo', f.number); query.set('precio', f.price); return `<article class="vuelo-card"><div><span class="campo-etiqueta">SALIDA</span><strong>${f.time}</strong></div><div><span class="campo-etiqueta">VUELO</span><strong>${f.number}</strong></div><div><span class="campo-etiqueta">DURACIÓN ESTIMADA</span><strong>1 h 05 min</strong></div><div><span class="campo-etiqueta">DESDE / PERSONA</span><strong>COP $${f.price.toLocaleString('es-CO')}</strong></div><a class="boton boton-oscuro" href="compra.html?${query.toString()}">Elegir vuelo</a></article>`; }).join('')}</div>`;
  }
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Reponer la búsqueda al volver desde la compra.
const previous = new URLSearchParams(location.search);
for (const key of ['origen','destino','fecha','hora','cabina','pasajeros']) {
  const control = form.elements.namedItem(key);
  if (previous.has(key)) {
    const value = previous.get(key);
    if (control.tagName !== 'SELECT' || [...control.options].some(option => option.value === value)) control.value = value;
  }
}
if (previous.get('buscar') === '1' && form.checkValidity()) form.requestSubmit();
