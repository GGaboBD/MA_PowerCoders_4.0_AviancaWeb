'use strict';
const argon2 = require('argon2');
const { rateLimit } = require('express-rate-limit');
const { origenLocal } = require('./sesion');

function validarRegistro(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Completa los datos del formulario.');
  const campos = ['nombre', 'apellido', 'correo', 'password'];
  if (Object.keys(body).some(key => !campos.includes(key)) || campos.some(key => typeof body[key] !== 'string')) {
    throw new Error('El registro solo admite nombre, apellido, correo y contraseña.');
  }
  const nombre = body.nombre.trim();
  const apellido = body.apellido.trim();
  const correo = body.correo.trim().toLowerCase();
  if (!nombre || !apellido || nombre.length > 80 || apellido.length > 80 || /[\u0000-\u001f\u007f]/.test(nombre + apellido)) {
    throw new Error('Escribe nombre y apellido de entre 1 y 80 caracteres.');
  }
  if (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('Escribe un correo válido.');
  // Nunca recortar, normalizar ni truncar la contraseña.
  if (body.password.length < 15 || body.password.length > 128 || !body.password.trim()) {
    throw new Error('Usa una contraseña de entre 15 y 128 caracteres.');
  }
  return { nombre, apellido, correo, password: body.password };
}

async function comprobarEsquema(db) {
  const [info] = await db.listCollections({ name: 'usuarios' }).toArray();
  const validator = info?.options?.validator;
  const schema = validator?.$jsonSchema || validator?.$and?.find(r => r.$jsonSchema)?.$jsonSchema;
  if (!schema?.properties?.nombre || !schema?.properties?.apellido) {
    throw new Error('Ejecuta primero: node --env-file=.env preparar-registro.js');
  }
  const indices = await db.collection('usuarios').listIndexes().toArray();
  if (!indices.some(i => i.unique && Object.keys(i.key).length === 1 && i.key.correo === 1 && i.collation?.locale === 'en' && i.collation?.strength === 2 && !i.partialFilterExpression && !i.sparse)) {
    throw new Error('Falta el índice único de correo. Ejecuta preparar-registro.js.');
  }
  if (!await db.collection('roles').findOne({ _id: 'cliente' })) throw new Error('Falta el rol cliente de la base original.');
}

module.exports = function registrarRegistro(app, db) {
  const limite = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { ok: false, mensaje: 'Demasiados intentos. Espera 15 minutos antes de intentar nuevamente.' } });
  app.post('/api/registro', origenLocal, limite, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // Este servidor se ejecuta únicamente en loopback. No habilitar CORS abierto.
    let datos;
    try { datos = validarRegistro(req.body); }
    catch (error) { return res.status(400).json({ ok: false, mensaje: error.message }); }
    try {
      const passwordHash = await argon2.hash(datos.password, {
        type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1,
      });
      // Lista explícita: nunca copiar roles, estado o tipoCuenta desde req.body.
      await db.collection('usuarios').insertOne({
        nombre: datos.nombre, apellido: datos.apellido, correo: datos.correo,
        passwordHash, tipoCuenta: 'cliente', roles: ['cliente'], estado: 'activo', creadoEn: new Date(),
      });
      res.status(201).json({ ok: true, mensaje: 'Cuenta creada. Ya puedes iniciar sesión.' });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ ok: false, mensaje: 'Ya existe una cuenta con ese correo. No se creó otra cuenta.' });
      if (error.code === 121) return res.status(503).json({ ok: false, mensaje: 'El esquema de usuarios no admite el registro. Revisa la preparación del backend.' });
      // No registrar req.body, contraseña, hash ni URI.
      console.error('Error de registro:', error.name, error.code || 'sin código');
      res.status(503).json({ ok: false, mensaje: 'No pudimos confirmar el registro. Comprueba la conexión antes de reintentar.' });
    }
  });
};
module.exports.validarRegistro = validarRegistro;
module.exports.comprobarEsquema = comprobarEsquema;
