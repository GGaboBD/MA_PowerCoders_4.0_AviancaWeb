const params = new URLSearchParams(location.search);
const cities = { BOG: 'Bogotá', MDE: 'Medellín', CLO: 'Cali', CTG: 'Cartagena' };
const count = Math.min(6, Math.max(1, Math.floor(Number(params.get('pasajeros'))) || 1));
const cabin = params.get('cabina') === 'primera' ? 'Primera clase' : 'Clase ejecutiva';
const price = Number(params.get('precio')) || 0;
const route = `${cities[params.get('origen')] || 'Bogotá'} → ${cities[params.get('destino')] || 'Medellín'}`;
document.querySelector('#ruta-vuelo').textContent = route;
document.querySelector('#fecha-vuelo').textContent = `${params.get('fecha') || 'Fecha pendiente'} · ${params.get('hora') || '—'}`;
document.querySelector('#detalle-vuelo').textContent = `${params.get('vuelo') || 'Vuelo demo'} · ${cabin}`;
document.querySelector('#cantidad-vuelo').textContent = String(count);
const passengersRoot = document.querySelector('#pasajeros-form');
for (let i = 1; i <= count; i++) {
  const field = (label, control, extra = '') => `<div class="campo-form ${extra}"><label for="p${i}-${label.id}">${label.text}</label>${control}</div>`;
  passengersRoot.insertAdjacentHTML('beforeend', `<section class="pasajero-bloque"><div class="pasajero-titulo"><h2>Pasajero ${i}</h2><span>Información para este itinerario</span></div><div class="campos-pasajero">${field({text:'Nombre',id:'nombre'},`<input id="p${i}-nombre" name="nombre" autocomplete="off" required>`)}${field({text:'Apellido',id:'apellido'},`<input id="p${i}-apellido" name="apellido" autocomplete="off" required>`)}${field({text:'Correo de contacto',id:'correo'},`<input id="p${i}-correo" name="correo" type="email" autocomplete="off" required>`)}${field({text:'Documento (demo)',id:'documento'},`<input id="p${i}-documento" name="documento" autocomplete="off" required>`)}${field({text:'Preferencia de comida',id:'comida'},`<select id="p${i}-comida" name="comida"><option>Sin preferencia</option><option>Vegetariana</option><option>Vegana</option><option>Sin gluten</option><option>Otra preferencia</option></select>`)}${field({text:'Atención a bordo',id:'atencion'},`<select id="p${i}-atencion" name="atencion"><option>Atención habitual</option><option>Prefiero descansar sin interrupciones</option><option>Prefiero que me consulten antes</option></select>`)}${field({text:'Alergias o notas (opcional)',id:'alergias'},`<input id="p${i}-alergias" name="alergias" autocomplete="off" placeholder="Déjalo vacío si no aplica">`,'alergias')}</div></section>`);
}
const form = document.querySelector('#formulario-compra');
const dialog = document.querySelector('#dialog-asientos');
const map = document.querySelector('#mapa-avion');
const picker = document.querySelector('#pasajero-activo');
const stateNode = document.querySelector('#estado-asientos');
const countNode = document.querySelector('#contador-asientos');
const occupied = new Set(['2B','4D','6A','7C','9D']);
let confirmed = Array(count).fill(null);
let draft = [...confirmed];
const back = new URLSearchParams(params);
back.set('buscar', '1');
document.querySelector('#volver-vuelos').href = `index.html?${back.toString()}#resultados`;
function passengerName(index) {
  return `${document.querySelector(`#p${index+1}-nombre`).value.trim()} ${document.querySelector(`#p${index+1}-apellido`).value.trim()}`.trim() || `Pasajero ${index+1}`;
}
function updateSeats(message = '') {
  const chosen = draft.filter(Boolean).length;
  countNode.textContent = message || `${chosen} de ${count} asientos seleccionados`;
  document.querySelector('#asignaciones').textContent = draft.map((seat,i) => `${passengerName(i)}: ${seat || 'pendiente'}`).join(' · ');
  for (const button of map.querySelectorAll('[data-seat]')) {
    const passenger = draft.indexOf(button.dataset.seat);
    button.classList.toggle('seleccionado', passenger !== -1);
    button.setAttribute('aria-pressed', String(passenger !== -1));
    button.setAttribute('aria-label', `Asiento ${button.dataset.seat}${button.disabled ? ', ocupado' : passenger !== -1 ? ', asignado a '+passengerName(passenger) : ', disponible'}`);
  }
}
function drawCabin() {
  const first = cabin === 'Primera clase';
  const start = first ? 1 : 4, end = first ? 3 : 11;
  let html = `<div class="plano-cabina"><div class="nariz-cabina">FRENTE DEL AVIÓN<br><strong>Cabina de pilotos</strong></div><div class="servicios-cabina"><span>Puerta</span><span>Cocina</span><span>Puerta</span></div><div class="cabina-separador">${cabin.toUpperCase()} · VISTA SUPERIOR</div>`;
  for (let row = start; row <= end; row++) {
    html += `<div class="fila-asientos primera"><span class="numero-fila">${row}</span>${['A','B','','C','D'].map(letter => {
      if (!letter) return '<span class="pasillo" aria-hidden="true">'+(row === start ? 'Pasillo' : '')+'</span>';
      const seat = `${row}${letter}`;
      return `<button type="button" class="asiento" data-seat="${seat}" aria-pressed="false" ${occupied.has(seat)?'disabled':''}>${seat}</button>`;
    }).join('')}</div>`;
  }
  html += '<div class="servicios-cabina servicios-traseros"><span>Salida</span><span>Baños</span><span>Salida</span></div><p class="cola-cabina">PARTE POSTERIOR DE LA CABINA</p></div>';
  map.innerHTML = html;
}
document.querySelector('#abrir-asientos').addEventListener('click', () => {
  if (!form.reportValidity()) return;
  draft = [...confirmed];
  picker.replaceChildren();
  for (let i=0;i<count;i++) picker.add(new Option(`${i+1}. ${passengerName(i)}`,String(i)));
  drawCabin(); updateSeats(); dialog.showModal();
});
map.addEventListener('click', event => {
  const button = event.target.closest('[data-seat]');
  if (!button || button.disabled) return;
  const seat = button.dataset.seat, index = Number(picker.value), assigned = draft.indexOf(seat);
  if (assigned !== -1 && assigned !== index) {
    updateSeats(`Ese asiento está asignado a ${passengerName(assigned)}. Elige otro.`); return;
  }
  draft[index] = draft[index] === seat ? null : seat;
  const next = draft.findIndex(value => !value);
  if (draft[index] && next !== -1) picker.value = String(next);
  updateSeats();
});
document.querySelector('.cerrar-dialogo').addEventListener('click', () => dialog.close());
document.querySelector('#confirmar-asientos').addEventListener('click', () => {
  if (draft.some(seat => !seat)) { updateSeats('Falta seleccionar un asiento para cada pasajero.'); return; }
  confirmed = [...draft];
  stateNode.textContent = confirmed.map((seat,i) => `${passengerName(i)}: ${seat}`).join(' · ');
  document.querySelector('#confirmacion').hidden = true;
  dialog.close();
});
form.addEventListener('input', () => { document.querySelector('#confirmacion').hidden = true; });
form.addEventListener('submit', event => {
  event.preventDefault();
  if (confirmed.some(seat => !seat)) {
    stateNode.textContent = 'Selecciona y confirma un asiento para cada pasajero.';
    document.querySelector('#abrir-asientos').focus(); return;
  }
  const confirmation = document.querySelector('#confirmacion');
  confirmation.replaceChildren();
  const title = document.createElement('h2'); title.textContent = 'Resumen de tu compra de prueba';
  const itinerary = document.createElement('p'); itinerary.textContent = `${route} · ${params.get('fecha')} · ${params.get('hora')} · ${cabin}`;
  confirmation.append(title, itinerary);
  confirmed.forEach((seat, i) => {
    const detail = document.createElement('p');
    detail.textContent = `${passengerName(i)} · Asiento ${seat} · ${document.querySelector(`#p${i+1}-comida`).value} · ${document.querySelector(`#p${i+1}-atencion`).value}`;
    confirmation.append(detail);
  });
  const total = document.createElement('p'); total.textContent = `Total estimado: COP $${(price * count).toLocaleString('es-CO')}. Simulación: no se ha cobrado ni emitido un boleto.`;
  confirmation.append(total);
  confirmation.hidden = false; confirmation.focus();
});
