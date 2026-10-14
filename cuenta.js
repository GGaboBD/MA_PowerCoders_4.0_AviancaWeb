/* Demostración de formularios. No autentica, transmite ni guarda credenciales. */
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
for (const mode of ['login', 'registro']) {
  const form = document.getElementById(`form-${mode}`);
  const message = document.getElementById(`mensaje-${mode}`);
  form.addEventListener('input', () => { message.hidden = true; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (mode === 'registro') validateRegistration();
    if (!form.reportValidity()) return;
    message.textContent = mode === 'login'
      ? 'Formulario validado. Cuando conectemos el sistema, aquí se comprobarán tus credenciales. Por ahora no se ha iniciado sesión.'
      : 'Formulario validado. Cuando conectemos el sistema, aquí se creará tu cuenta. Por ahora no se ha guardado ningún dato.';
    message.hidden = false;
  });
}
