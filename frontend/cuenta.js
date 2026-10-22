/* Registro conectado a la API. Inicio de sesión conectado a MongoDB. */
'use strict';
const tabs = [...document.querySelectorAll('[role="tab"]')];
function changePanel(mode, focusTab = false) {
  tabs.forEach(tab => {
    const active = tab.id === `tab-${mode}`;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    if (active && focusTab) tab.focus();
  });
  document.querySelectorAll('.cuenta-mensaje').forEach(message => { message.hidden = true; });
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => changePanel(tab.id.replace('tab-', '')));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + 1) % tabs.length;
    changePanel(tabs[next].id.replace('tab-', ''), true);
  });
});
document.querySelectorAll('[data-switch]').forEach(button => {
  button.addEventListener('click', () => changePanel(button.dataset.switch, true));
});
document.querySelectorAll('[data-password]').forEach(button => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.password);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Ocultar' : 'Mostrar';
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', `${show ? 'Ocultar' : 'Mostrar'} ${input.id.endsWith('confirmacion') ? 'confirmación de contraseña' : 'contraseña'}`);
  });
});
const registration = document.getElementById('form-registro');
const password = document.getElementById('registro-password');
const confirmation = document.getElementById('registro-confirmacion');
function validateRegistration() {
  confirmation.setCustomValidity(confirmation.value && confirmation.value !== password.value ? 'Las contraseñas deben coincidir.' : '');
  ['registro-nombre', 'registro-apellido'].forEach(id => {
    const input = document.getElementById(id);
    input.setCustomValidity(input.value && !input.value.trim() ? 'Escribe un nombre o apellido válido.' : '');
  });
}
registration.addEventListener('input', validateRegistration);

const message = document.getElementById('mensaje-registro');
const submit = registration.querySelector('[type="submit"]');
submit.disabled = false;
let pending = false;
registration.addEventListener('input', () => { if (!pending) message.hidden = true; });
registration.addEventListener('submit', async event => {
  event.preventDefault();
  if (pending) return;
  validateRegistration();
  if (!registration.reportValidity()) return;
  const body = {
    nombre: document.getElementById('registro-nombre').value,
    apellido: document.getElementById('registro-apellido').value,
    correo: document.getElementById('registro-email').value,
    password: password.value,
  };
  pending = true;
  const controls = [...registration.querySelectorAll('input, button')];
  controls.forEach(control => { control.disabled = true; });
  submit.textContent = 'Creando cuenta…';
  registration.setAttribute('aria-busy', 'true');
  message.textContent = 'Guardando tu cuenta…'; message.hidden = false;
  try {
    const response = await fetch('/api/registro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      message.textContent = result.mensaje || 'No se pudo completar el registro.';
      return;
    }
    registration.reset();
    password.type = 'password'; confirmation.type = 'password';
    registration.querySelectorAll('[data-password]').forEach(button => {
      button.textContent = 'Mostrar'; button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', button.dataset.password.endsWith('confirmacion') ? 'Mostrar confirmación de contraseña' : 'Mostrar contraseña');
    });
    message.textContent = 'Cuenta creada correctamente. Abre Iniciar sesión para acceder con tu correo y contraseña.';
    document.getElementById('login-email').value = body.correo.trim().toLowerCase();
  } catch {
    message.textContent = 'No pudimos confirmar el resultado. La cuenta podría haberse guardado: comprueba usuarios en MongoDB antes de reintentar.';
  } finally {
    pending = false;
    controls.forEach(control => { control.disabled = false; });
    submit.textContent = 'Crear cuenta';
    registration.setAttribute('aria-busy', 'false');
    message.hidden = false;
  }
});
const loginForm = document.getElementById('form-login');
const loginMessage = document.getElementById('mensaje-login');
const loginSubmit = loginForm.querySelector('[type="submit"]');
loginSubmit.disabled = false;
let loggingIn = false;
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (loggingIn || !loginForm.reportValidity()) return;
  loggingIn = true;
  const controls = [...loginForm.querySelectorAll('input, button')];
  const body = { correo: document.getElementById('login-email').value, password: document.getElementById('login-password').value };
  controls.forEach(control => { control.disabled = true; });
  loginSubmit.textContent = 'Ingresando…';
  loginForm.setAttribute('aria-busy', 'true');
  loginMessage.textContent = 'Comprobando tus datos…'; loginMessage.hidden = false;
  try {
    const response = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok || !result.ok) { loginMessage.textContent = result.mensaje || 'No se pudo iniciar sesión.'; return; }
    document.getElementById('login-password').value = '';
    window.SesionUI.autenticar(result.usuario);
    document.getElementById('sesion-nombre').setAttribute('tabindex', '-1');
    document.getElementById('sesion-nombre').focus();
  } catch {
    loginMessage.textContent = 'No pudimos confirmar el acceso. Recarga la página para comprobar si la sesión se inició.';
  } finally {
    loggingIn = false;
    controls.forEach(control => { control.disabled = false; });
    loginSubmit.textContent = 'Iniciar sesión';
    loginForm.setAttribute('aria-busy', 'false');
  }
});
changePanel('login');
