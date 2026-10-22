/* Estado de sesión compartido. La cookie HttpOnly la administra el navegador. */
(() => {
  'use strict';
  let version = 0;
  let usuario = null;
  let comprobando = false;
  const header = document.querySelector('.encabezado .navegacion');
  const links = [...document.querySelectorAll('a[href="cuenta.html"]')];
  const salida = document.createElement('button');
  salida.type = 'button'; salida.className = 'boton boton-contorno sesion-salir';
  salida.textContent = 'Cerrar sesión'; salida.hidden = true;
  if (header) header.append(salida);
  const aviso = document.createElement('p');
  aviso.className = 'sesion-aviso'; aviso.setAttribute('role', 'status'); aviso.hidden = true;
  if (header) header.after(aviso);

  function pintar(user) {
    usuario = user;
    window.dispatchEvent(new CustomEvent("sesion-cambio", {detail:user}));
    for (const link of links) link.textContent = user ? 'Mi cuenta' : 'Iniciar sesión';
    salida.hidden = !user;
    const perfil = document.getElementById('perfil-sesion');
    const acceso = document.getElementById('formularios-acceso');
    if (perfil && acceso) {
      perfil.hidden = !user; acceso.hidden = Boolean(user);
      if (user) {
        document.getElementById('sesion-nombre').textContent = `${user.nombre} ${user.apellido}`.trim() || 'Tu cuenta';
        document.getElementById('sesion-correo').textContent = user.correo;
        // No dejar contraseñas en formularios ocultos tras autenticar.
        for (const input of acceso.querySelectorAll('input[name="password"], input[name="confirmacion"]')) input.value = '';
      }
    }
  }
  async function actualizar() {
    const actual = ++version;
    comprobando = true;
    try {
      const response = await fetch('/api/sesion', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (actual !== version) return;
      if (response.status === 401) { pintar(null); aviso.hidden = true; return; }
      const data = await response.json();
      if (actual !== version) return;
      if (!response.ok || !data.ok) throw new Error('sesion');
      pintar(data.usuario); aviso.hidden = true;
    } catch {
      if (actual !== version) return;
      pintar(null);
      aviso.textContent = 'No pudimos comprobar tu sesión. Comprueba que el servidor esté encendido y recarga la página.';
      aviso.hidden = false;
    } finally { if (actual === version) comprobando = false; }
  }
  salida.addEventListener('click', async () => {
    salida.disabled = true;
    ++version; comprobando = false;
    try {
      const response = await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error('logout');
      ++version; pintar(null);
      aviso.textContent = 'Sesión cerrada.'; aviso.hidden = false;
    } catch {
      aviso.textContent = 'No pudimos confirmar el cierre de sesión. Intenta nuevamente.'; aviso.hidden = false;
    } finally { salida.disabled = false; }
  });
  window.SesionUI = {
    actualizar,
    autenticar(user) { ++version; comprobando = false; pintar(user); aviso.hidden = true; },
  };
  window.addEventListener('pageshow', () => { if (!comprobando) actualizar(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !comprobando) actualizar(); });
  actualizar();
})();
