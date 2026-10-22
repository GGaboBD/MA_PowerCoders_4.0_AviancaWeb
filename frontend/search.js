'use strict';
const routeNames = { SAL: 'San Salvador', MIA: 'Miami', BOG: 'Bogotá', MDE: 'Medellín', CLO: 'Cali', CTG: 'Cartagena' };
const form = document.querySelector('#formulario-busqueda');
const results = document.querySelector('#resultados');
const button = form.querySelector('[type="submit"]');
const today = new Date();
const localISODate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
form.elements.fecha.value = localISODate;
// La API excluye salidas pasadas según el instante UTC. No imponemos la fecha
// de la computadora como mínimo: puede estar en otra zona que el aeropuerto.
let activeRequest;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function message(text) {
  results.replaceChildren(element('p', text, 'mensaje-busqueda'));
}
function field(label, value) {
  const box = element('div');
  box.append(element('span', label, 'campo-etiqueta'), element('strong', value));
  return box;
}
function render(flights, data, hayMas) {
  const title = element('div', undefined, 'resultados-titulo');
  title.append(element('p', `RESULTADOS · ${data.fecha}`, 'etiqueta'),
    element('h2', `${routeNames[data.origen]} → ${routeNames[data.destino]}`),
    element('p', `${data.cabina === 'primera' ? 'Primera clase' : 'Clase ejecutiva'} · ${data.pasajeros} pasajero(s)`));
  results.replaceChildren(title);
  if (!flights.length) {
    title.append(element('p', 'No hay vuelos con suficientes asientos para esta búsqueda. Prueba otra fecha, hora o cabina.'));
    return;
  }
  const list = element('div', undefined, 'lista-vuelos');
  for (const flight of flights) {
    const card = element('article', undefined, 'vuelo-card');
    const price = new Intl.NumberFormat('es-SV', { style: 'currency', currency: flight.moneda, currencyDisplay: 'code' }).format(Number(flight.precio));
    const duration = `${Math.floor(flight.duracionMinutos / 60)} h ${flight.duracionMinutos % 60} min`;
    const detailButton = element('button', 'Ver detalle', 'boton boton-oscuro');
    detailButton.type = 'button';
    detailButton.setAttribute('aria-expanded', 'false');
    const detail = element('div', undefined, 'mensaje-busqueda');
    detail.id = `detalle-vuelo-${list.children.length}`;
    detail.hidden = true;
    detail.style.gridColumn = '1 / -1';
    detailButton.setAttribute('aria-controls', detail.id);
    detail.append(element('p', `${flight.codigo} · ${flight.disponibles} asiento(s) disponibles en esta cabina.`),
      element('p', `Salida: ${flight.fecha} ${flight.hora} (${flight.zonaOrigen}). Llegada: ${flight.llegadaLocal.fecha} ${flight.llegadaLocal.hora} (${flight.zonaDestino}).`),
      element('p', 'La disponibilidad puede cambiar. Elegir un asiento todavía no lo reserva.'));
    const choose = element('a', 'Elegir vuelo', 'boton boton-rojo');
    choose.href = `compra.html?${new URLSearchParams({ vueloId: flight.id, cabina: data.cabina, pasajeros: data.pasajeros })}`;
    const actions = element('div');
    actions.append(choose, detailButton);
    detailButton.addEventListener('click', () => {
      detail.hidden = !detail.hidden;
      detailButton.setAttribute('aria-expanded', String(!detail.hidden));
      detailButton.textContent = detail.hidden ? 'Ver detalle' : 'Ocultar detalle';
    });
    card.append(field('SALIDA LOCAL', flight.hora), field('VUELO', flight.codigo),
      field('DURACIÓN', duration), field('POR PERSONA', price), actions, detail);
    list.append(card);
  }
  results.append(list);
  if (hayMas) results.append(element('p', 'Se muestran las primeras 100 coincidencias. Ajusta la hora para acotar la búsqueda.'));
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const data = Object.fromEntries(new FormData(form));
  results.hidden = false;
  if (data.origen === data.destino) {
    message('El origen y el destino deben ser diferentes.');
    button.disabled = false;
    button.textContent = 'Explorar vuelos';
    results.setAttribute('aria-busy', 'false');
    return;
  }
  button.disabled = true;
  button.textContent = 'Buscando…';
  results.setAttribute('aria-busy', 'true');
  message('Consultando vuelos…');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`/api/vuelos?${new URLSearchParams(data)}`, { signal: controller.signal, cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.mensaje || 'No se pudo consultar la API.');
    if (!Array.isArray(payload.vuelos)) throw new Error('La API devolvió una respuesta inesperada.');
    if (activeRequest === controller) render(payload.vuelos, data, payload.hayMas);
  } catch (error) {
    if (activeRequest === controller) message(error.name === 'AbortError'
      ? 'La consulta tardó demasiado. Intenta nuevamente.'
      : 'No pudimos cargar los vuelos. Comprueba que el servidor está encendido y abre la web desde http://localhost:3000.');
  } finally {
    clearTimeout(timeout);
    if (activeRequest === controller) {
      button.disabled = false;
      button.textContent = 'Explorar vuelos';
      results.setAttribute('aria-busy', 'false');
    }
  }
});

const previous = new URLSearchParams(location.search);
for (const key of ['origen', 'destino', 'fecha', 'hora', 'cabina', 'pasajeros']) {
  const control = form.elements.namedItem(key);
  if (previous.has(key)) {
    const value = previous.get(key);
    if (control.tagName !== 'SELECT' || [...control.options].some(option => option.value === value)) control.value = value;
  }
}
if (previous.get('buscar') === '1' && form.checkValidity()) form.requestSubmit();
if ('ResizeObserver' in window) {
  new ResizeObserver(entries => {
    results.style.scrollMarginTop = `${entries[0].target.getBoundingClientRect().height + 36}px`;
  }).observe(document.querySelector('#buscar-vuelos'));
}
