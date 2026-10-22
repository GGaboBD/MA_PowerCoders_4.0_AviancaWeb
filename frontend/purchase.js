// Reserva académica: los datos solo se envían al confirmar explícitamente.
'use strict';
const params = new URLSearchParams(location.search);
const status = document.querySelector('#estado-carga');
const columns = document.querySelector('.compra-columnas');
const progress = document.querySelector('.compra-progreso');
const flightId = params.get('vueloId');
const cabinKey = params.get('cabina');
const passengerValue = params.get('pasajeros');
const count = Number(passengerValue);
const cities = { SAL: 'San Salvador', MIA: 'Miami', BOG: 'Bogotá', MDE: 'Medellín', CLO: 'Cali', CTG: 'Cartagena' };
let flight;
async function fetchFlight() {
  if (!/^[a-f0-9]{24}$/i.test(flightId || '') || !['ejecutiva', 'primera'].includes(cabinKey) || !/^[1-6]$/.test(passengerValue || '')) {
    throw new Error('Abre esta página desde Elegir vuelo en el buscador.');
  }
  const response = await fetch(`/api/vuelos/${flightId}?${new URLSearchParams({ cabina: cabinKey, pasajeros: passengerValue })}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el vuelo.');
  if (!data.vuelo || !Array.isArray(data.vuelo.asientos)) throw new Error('La respuesta del vuelo no es válida.');
  return data.vuelo;
}
async function init() {
  const sessionResponse = await fetch('/api/sesion', {credentials:'same-origin',cache:'no-store'});
  if (sessionResponse.status === 401) {
    status.textContent = 'Inicia sesión antes de completar la compra. Después vuelve a esta pestaña y recarga. ';
    const link = document.createElement('a'); link.href='cuenta.html'; link.target='_blank'; link.rel='noopener'; link.textContent='Abrir mi cuenta'; status.append(link);
    return;
  }
  const sessionData = await sessionResponse.json();
  if (!sessionResponse.ok || !sessionData.ok) throw new Error('No pudimos comprobar tu sesión. Recarga para intentar de nuevo.');
  if (sessionData.usuario.tipoCuenta !== 'cliente') throw new Error('Para reservar utiliza una cuenta de cliente.');
  flight = await fetchFlight();
  const cabin = cabinKey === 'primera' ? 'Primera clase' : 'Clase ejecutiva';
  let price = Number(flight.precio);
  const money = value => new Intl.NumberFormat('es-SV', { style: 'currency', currency: flight.moneda, currencyDisplay: 'code' }).format(value);
  // La ruta, fecha, hora y tarifa proceden de la API, nunca de valores de precio en la URL.
  for (const [key, value] of Object.entries({ origen: flight.origen, destino: flight.destino, fecha: flight.fecha, hora: flight.hora, vuelo: flight.codigo })) params.set(key, value);
  const travelDate = new Date(flight.fecha + 'T12:00:00Z').toLocaleDateString('es-SV', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
  const route = `${cities[flight.origen] || flight.origen} → ${cities[flight.destino] || flight.destino}`;
document.querySelector('#ruta-vuelo').textContent = route;
document.querySelector('#fecha-vuelo').textContent = `${travelDate} · ${params.get('hora') || '—'}`;
document.querySelector('#detalle-vuelo').textContent = `${params.get('vuelo') || 'Vuelo demo'} · ${cabin}`;
document.querySelector('#cantidad-vuelo').textContent = String(count);
const passengersRoot = document.querySelector('#pasajeros-form');
for (let i = 1; i <= count; i++) {
  const field = (label, control, extra = '') => `<div class="campo-form ${extra}"><label for="p${i}-${label.id}">${label.text}</label>${control}</div>`;
  passengersRoot.insertAdjacentHTML('beforeend', `<section class="pasajero-bloque"><div class="pasajero-titulo"><h2>Pasajero ${i}</h2><span>Información para este itinerario</span></div><div class="campos-pasajero">${field({text:'Nombre',id:'nombre'},`<input id="p${i}-nombre" name="nombre" maxlength="80" autocomplete="off" required>`)}${field({text:'Apellido',id:'apellido'},`<input id="p${i}-apellido" name="apellido" maxlength="80" autocomplete="off" required>`)}${field({text:'Fecha de nacimiento',id:'nacimiento'},`<input id="p${i}-nacimiento" type="date" min="1900-01-01" max="${new Date().toISOString().slice(0,10)}" required>`)}${field({text:'Tipo de documento',id:'tipo'},`<select id="p${i}-tipo"><option value="pasaporte">Pasaporte</option><option value="identidad">Identidad</option></select>`)}${field({text:'País emisor (2 letras, ej. SV)',id:'pais'},`<input id="p${i}-pais" maxlength="2" pattern="[A-Za-z]{2}" value="SV" required>`)}${field({text:'Documento (demo)',id:'documento'},`<input id="p${i}-documento" name="documento" maxlength="40" autocomplete="off" required>`)}${field({text:'Preferencia de comida',id:'comida'},`<select id="p${i}-comida" name="comida"><option>Sin preferencia</option><option>Vegetariana</option><option>Vegana</option><option>Sin gluten</option><option>Otra preferencia</option></select>`)}${field({text:'Atención a bordo',id:'atencion'},`<select id="p${i}-atencion" name="atencion"><option>Atención habitual</option><option>Prefiero descansar sin interrupciones</option><option>Prefiero que me consulten antes</option></select>`)}${field({text:'Bebida (opcional)',id:'bebida'},`<input id="p${i}-bebida" maxlength="80">`)}${field({text:'Notas (opcional)',id:'notas'},`<input id="p${i}-notas" maxlength="900">`)}${field({text:'Alergias separadas por comas (opcional)',id:'alergias'},`<input id="p${i}-alergias" name="alergias" autocomplete="off" placeholder="Déjalo vacío si no aplica">`,'alergias')}</div></section>`);
}
const form = document.querySelector('#formulario-compra');
const dialog = document.querySelector('#dialog-asientos');
const map = document.querySelector('#mapa-avion');
const picker = document.querySelector('#pasajero-activo');
const stateNode = document.querySelector('#estado-asientos');
const countNode = document.querySelector('#contador-asientos');
let busy = false;
let saved = false;
let pending = null;
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
  map.replaceChildren();
  const plane = element('div', undefined, 'plano-cabina');
  plane.append(element('div', 'FRENTE DEL AVIÓN', 'nariz-cabina'), element('div', `${cabin} · Asientos registrados`, 'cabina-separador'));
  const groups = new Map();
  for (const seat of [...flight.asientos].sort((a,b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))) {
    const row = seat.codigo.match(/^\d+/)?.[0] || 'Otros';
    if (!groups.has(row)) groups.set(row, []);
    groups.get(row).push(seat);
  }
  for (const [row, seats] of groups) {
    const line = element('div', undefined, 'fila-inventario');
    line.append(element('span', `Fila ${row}`, 'numero-inventario'));
    for (const seat of seats) {
      const button = element('button', seat.codigo, 'asiento');
      button.type = 'button'; button.dataset.seat = seat.codigo;
      button.disabled = !seat.disponible;
      button.setAttribute('aria-pressed', 'false');
      line.append(button);
    }
    plane.append(line);
  }
  plane.append(element('p', 'Distribución esquemática: no representa posiciones físicas exactas.', 'cola-cabina'));
  map.append(plane);
}
function setBusy(value) {
  busy = value;
  for (const control of document.querySelectorAll('#abrir-asientos, #confirmar-asientos, #paso-asientos, #paso-resumen, button[type="submit"]')) control.disabled = value;
}
async function refreshFlight() {
  const fresh = await fetchFlight();
  // Un cambio de itinerario requiere volver a elegir el vuelo.
  if (fresh.salida !== flight.salida || fresh.llegada !== flight.llegada || fresh.origen !== flight.origen || fresh.destino !== flight.destino) {
    throw new Error('El itinerario cambió. Vuelve al buscador para elegirlo nuevamente.');
  }
  const changedPrice = fresh.precio !== flight.precio || fresh.moneda !== flight.moneda;
  flight = fresh;
  price = Number(flight.precio);
  const free = new Set(flight.asientos.filter(a => a.disponible).map(a => a.codigo));
  const lost = confirmed.some(seat => seat && !free.has(seat));
  confirmed = confirmed.map(seat => free.has(seat) ? seat : null);
  draft = draft.map(seat => free.has(seat) ? seat : null);
  document.querySelector('#precio-unitario').textContent = money(price);
  document.querySelector('#precio-total').textContent = money(price * count);
  document.querySelector('#moneda-total').textContent = flight.moneda;
  refreshSidebar();
  if (lost || changedPrice) document.querySelector('#confirmacion').hidden = true;
  status.textContent = lost ? 'Cambió la disponibilidad. Selecciona nuevamente los asientos pendientes.' : changedPrice ? 'La tarifa cambió. Revisa el precio actualizado antes de continuar.' : 'Disponibilidad consultada. La selección todavía no reserva asientos.';
  return { lost, changedPrice };
}
function showFailure(error) {
  document.querySelector('#confirmacion').hidden = true;
  status.textContent = error.name === 'TimeoutError' ? 'La consulta tardó demasiado. Intenta nuevamente.' : error.message;
  stateNode.textContent = status.textContent;
}
document.querySelector('#abrir-asientos').addEventListener('click', async () => {
  if (busy || saved || !form.reportValidity()) return;
  setBusy(true);
  try {
    await refreshFlight();
    draft = [...confirmed];
    picker.replaceChildren();
    for (let i=0;i<count;i++) picker.add(new Option(`${i+1}. ${passengerName(i)}`,String(i)));
    drawCabin(); updateSeats();
    if (!dialog.open) dialog.showModal();
    setStep('asientos');
  } catch (error) { showFailure(error); }
  finally { setBusy(false); }
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
document.querySelector('#confirmar-asientos').addEventListener('click', async () => {
  if (busy || saved) return;
  if (draft.some(seat => !seat)) { updateSeats('Falta seleccionar un asiento para cada pasajero.'); return; }
  setBusy(true);
  try {
    await refreshFlight();
    if (draft.some(seat => !seat)) {
      drawCabin(); updateSeats('Un asiento dejó de estar disponible. Elige otro.'); return;
    }
    confirmed = [...draft];
    stateNode.textContent = confirmed.map((seat,i) => `${passengerName(i)}: ${seat}`).join(' · ');
    document.querySelector('#confirmacion').hidden = true;
    dialog.close(); refreshSidebar(); setStep('resumen');
  } catch (error) { showFailure(error); updateSeats(status.textContent); }
  finally { setBusy(false); }
});
form.addEventListener('input', () => { if (saved) return; document.querySelector('#confirmacion').hidden = true; refreshSidebar(); setStep('datos'); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || saved || !form.reportValidity()) return;
  if (confirmed.some(seat => !seat)) {
    stateNode.textContent = 'Selecciona y confirma un asiento para cada pasajero.';
    document.querySelector('#abrir-asientos').focus(); return;
  }
  setBusy(true);
  try {
    const changes = await refreshFlight();
    if (confirmed.some(seat => !seat)) return;
    renderReview();
    if (changes.changedPrice) status.textContent = 'El resumen muestra la tarifa actualizada. Revísala: no se ha realizado ninguna compra.';
  } catch (error) { showFailure(error); }
  finally { setBusy(false); }
});
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function setStep(step) {
  for (const id of ['datos', 'asientos', 'resumen']) {
    const control = document.getElementById(`paso-${id}`);
    if (step === id) control.setAttribute('aria-current','step');
    else control.removeAttribute('aria-current');
  }
}
function refreshSidebar() {
  const target = document.querySelector('#lateral-asientos');
  target.replaceChildren();
  confirmed.forEach((seat,i) => {
    const row = element('p'); row.append(element('span',passengerName(i)),element('strong',seat || 'Pendiente')); target.append(row);
  });
  stateNode.textContent = confirmed.map((seat,i) => `${passengerName(i)}: ${seat || 'pendiente'}`).join(' · ');
}

function buildPayload() {
  const get=(i,key)=>document.querySelector(`#p${i+1}-${key}`).value.trim();
  const foods={'Sin preferencia':'sin_preferencia','Vegetariana':'vegetariana','Vegana':'vegana','Sin gluten':'sin_gluten','Otra preferencia':'otra'};
  return {vueloId:flightId,clase:cabinKey,precioAceptado:flight.precio,monedaAceptada:flight.moneda,salidaAceptada:flight.salida,
    pasajeros:confirmed.map((asiento,i)=>({asiento,nombres:get(i,'nombre'),apellidos:get(i,'apellido'),fechaNacimiento:get(i,'nacimiento'),
      documento:{tipo:get(i,'tipo'),paisEmisor:get(i,'pais').toUpperCase(),numero:get(i,'documento')},
      preferencias:{comida:foods[get(i,'comida')],noMolestar:get(i,'atencion')==='Prefiero descansar sin interrupciones',
        alergias:get(i,'alergias').split(',').map(a=>a.trim()).filter(Boolean),bebida:get(i,'bebida'),
        notas:[get(i,'notas'),get(i,'atencion')==='Prefiero que me consulten antes'?'Consultar antes de interrumpir.':''].filter(Boolean).join(' ')}}))};
}
async function saveReservation(button,review) {
  if (busy || saved || !form.reportValidity()) return;
  const payload=buildPayload();
  const fingerprint=JSON.stringify(payload);
  if (!pending || pending.fingerprint!==fingerprint) pending={fingerprint,body:{...payload,solicitudId:crypto.randomUUID()}};
  setBusy(true);
  // Un resultado incierto conserva esta misma solicitud y bloquea la edición hasta reintentarlo.
  for (const control of form.querySelectorAll('input,select,button')) control.disabled=true;
  for (const control of review.querySelectorAll('button')) control.disabled=true;
  button.textContent='Guardando…';
  try {
    const response=await fetch('/api/reservas',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.body),signal:AbortSignal.timeout(30000)});
    const result=await response.json();
    if (!response.ok || !result.ok) {
      if (response.status < 500) {
        pending=null;
        for (const control of form.querySelectorAll('input,select,button')) control.disabled=false;
        for (const control of review.querySelectorAll('button')) control.disabled=false;
      }
      throw new Error(result.mensaje || 'No pudimos confirmar el resultado. Reintenta sin cambiar los datos.');
    }
    saved=true;
    review.replaceChildren(element('h2','Reserva de prueba confirmada'),element('p',`Localizador: ${result.localizador}`),element('p',result.mensaje));
    for(const ticket of result.boletos) review.append(element('p',`Asiento ${ticket.asiento} · Boleto ${ticket.numero} · ${ticket.moneda} ${ticket.precio}`));
    const home=element('a','Volver a vuelos','boton boton-rojo');home.href='index.html#buscar-vuelos';review.append(home);
    const mine=element('a','Mis reservas','boton boton-contorno');mine.href='mis-reservas.html';review.append(mine);
    status.textContent='Reserva guardada en tu cuenta. Los asientos seleccionados ya están ocupados en el prototipo.';
    review.focus();
  } catch(error) {
    status.textContent=error.name==='TimeoutError' || error instanceof TypeError ? 'No pudimos comprobar el resultado. Pulsa Reintentar confirmación con los mismos datos; no recargues esta página.' : error.message;
    button.textContent='Reintentar confirmación';button.disabled=false;
    if (status.textContent.includes('Inicia sesión')) {
      const login=element('a',' Abrir mi cuenta');login.href='cuenta.html';login.target='_blank';login.rel='noopener';status.append(login);
    }
  } finally {
    busy=false;
    if (!saved && !pending) setBusy(false);
  }
}

function renderReview() {
  const review = document.querySelector('#confirmacion'); review.replaceChildren();
  const head = element('header',undefined,'ticket-cabecera');
  head.append(element('span','REVISIÓN DE COMPRA · DEMOSTRACIÓN','etiqueta'),element('h2',route),element('p',`${travelDate} · Salida ${params.get('hora')} · ${params.get('vuelo')} · ${cabin}`));
  const body = element('div',undefined,'ticket-cuerpo');
  confirmed.forEach((seat,i) => {
    const item = element('article',undefined,'ticket-pasajero');
    const person = element('div',undefined,'ticket-persona');
    person.append(element('h3',passengerName(i)),element('span',`Asiento ${seat}`,'ticket-asiento'));
    const details = element('dl',undefined,'ticket-datos');
    for (const [label, field] of [['Nacimiento','nacimiento'],['Tipo','tipo'],['País emisor','pais'],['Documento','documento'],['Comida','comida'],['Atención a bordo','atencion'],['Alergias','alergias'],['Bebida','bebida'],['Notas','notas']]) {
      const block = element('div');
      block.append(element('dt',label),element('dd',document.querySelector(`#p${i+1}-${field}`).value.trim() || 'No especificadas'));
      details.append(block);
    }
    item.append(person,details); body.append(item);
  });
  const footer = element('footer',undefined,'ticket-pie');
  footer.append(element('p',`${count} ${count===1?'pasajero':'pasajeros'} × ${money(price)}`));
  const total = element('div',undefined,'precio-total'); total.append(element('span',`Total estimado · ${flight.moneda}`),element('strong',money(price*count))); footer.append(total);
  footer.append(element('p','Revisión de prueba: no se ha guardado una reserva, bloqueado un asiento, realizado un cobro ni emitido un boleto.','lateral-nota'));
  const actions = element('div',undefined,'ticket-acciones');
  const edit = element('button','Editar datos','boton boton-asientos'); edit.type='button';
  edit.addEventListener('click',()=> { setStep('datos'); document.querySelector('#p1-nombre').focus(); });
  const seats = element('button','Cambiar asientos','boton boton-oscuro'); seats.type='button';
  seats.addEventListener('click',()=>document.querySelector('#abrir-asientos').click());
  const reserve = element('button','Confirmar reserva de prueba','boton boton-rojo'); reserve.type='button';
  reserve.addEventListener('click',()=>saveReservation(reserve,review));
  actions.append(edit,seats,reserve); footer.append(actions); review.append(head,body,footer);
  review.hidden=false; setStep('resumen'); review.focus({preventScroll:true}); review.scrollIntoView({behavior:'smooth',block:'start'});
}
document.querySelector('#lateral-ruta').textContent=route;
document.querySelector('#lateral-fecha').textContent=`${travelDate} · ${params.get('hora') || '—'}`;
document.querySelector('#lateral-cabina').textContent=cabin;
document.querySelector('#precio-unitario').textContent=money(price);
document.querySelector('#lateral-pasajeros').textContent=String(count);
document.querySelector('#precio-total').textContent=money(price*count);
document.querySelector('#moneda-total').textContent=flight.moneda;
refreshSidebar();
document.querySelector('#paso-datos').addEventListener('click',()=>setStep('datos'));
document.querySelector('#paso-asientos').addEventListener('click',()=>document.querySelector('#abrir-asientos').click());
document.querySelector('#paso-resumen').addEventListener('click',()=>form.requestSubmit());
document.querySelector('#abrir-asientos').addEventListener('click',()=> {if(dialog.open)setStep('asientos');});

columns.hidden = false;
progress.hidden = false;
status.textContent = 'Sesión verificada. Completa datos ficticios y revisa el resumen antes de confirmar. La selección todavía no reserva asientos.';
}
init().catch(error => {
  status.textContent = error.name === 'TimeoutError' ? 'La consulta tardó demasiado. Recarga para intentar nuevamente.' : error.message;
  columns.hidden = true;
  progress.hidden = true;
});
