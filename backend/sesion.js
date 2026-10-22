'use strict';
const { randomBytes, createHash } = require('node:crypto');
const argon2 = require('argon2');
const { rateLimit } = require('express-rate-limit');
const COOKIE = 'avianca_sesion';
const DURACION = 8 * 60 * 60 * 1000;
const EN_PRODUCCION =
  process.env.RENDER === 'true' ||
  process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: EN_PRODUCCION,
  path: '/',
};
const digest = token => createHash('sha256').update(token).digest('hex');
function leerToken(req) {
  const matches = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(COOKIE + '='));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function publico(usuario) {
  return { id: String(usuario._id), nombre: usuario.nombre || '', apellido: usuario.apellido || '', correo: usuario.correo, tipoCuenta: usuario.tipoCuenta };
}
function origenLocal(req, res, next) {
  const port = Number(process.env.PORT || 3000);
  const permitidos = new Set();

  if (!EN_PRODUCCION) {
    permitidos.add(`http://localhost:${port}`);
    permitidos.add(`http://127.0.0.1:${port}`);
  }

  const direcciones = [
    process.env.RENDER_EXTERNAL_URL,
    process.env.PUBLIC_ORIGIN,
  ];

  for (const direccion of direcciones) {
    if (!direccion) continue;

    try {
      const url = new URL(direccion);

      if (url.protocol === 'https:') {
        permitidos.add(url.origin);
      }
    } catch {
      // Una dirección mal configurada no se autoriza.
    }
  }

  if (!permitidos.has(req.get('origin'))) {
    return res.status(403).json({
      ok: false,
      mensaje: 'Abre el formulario desde la dirección de la página del proyecto.',
    });
  }

  if (!req.is('application/json')) {
    return res.status(415).json({
      ok: false,
      mensaje: 'La solicitud debe ser JSON.',
    });
  }

  next();
}

async function preparar(db) {
  const nombre = 'sesiones_web';
  const [info] = await db.listCollections({ name: nombre }).toArray();
  if (!info) {
    await db.createCollection(nombre, { validator: { $jsonSchema: {
      bsonType: 'object', additionalProperties: false,
      required: ['_id', 'usuarioId', 'creadoEn', 'expiraEn'],
      properties: {
        _id: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
        usuarioId: { bsonType: 'objectId' }, creadoEn: { bsonType: 'date' }, expiraEn: { bsonType: 'date' },
      },
    } }, validationLevel: 'strict', validationAction: 'error' });
  } else if (info.options?.validator?.$jsonSchema?.properties?._id?.bsonType !== 'string' ||
             info.options?.validator?.$jsonSchema?.properties?.usuarioId?.bsonType !== 'objectId') {
    throw new Error('sesiones_web ya existe con otro esquema. No se modificó la colección.');
  }
  await db.collection(nombre).createIndex({ expiraEn: 1 }, { expireAfterSeconds: 0, name: 'sesion_expirada' });
  await db.collection(nombre).createIndex({ usuarioId: 1 }, { name: 'sesion_por_usuario' });
}

module.exports = async function registrarSesion(app, db) {
  await preparar(db);
  const sesiones = db.collection('sesiones_web');
  const usuarios = db.collection('usuarios');
  const dummyHash = await argon2.hash(randomBytes(32).toString('hex'), {
    type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1,
  });
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { ok: false, mensaje: 'Demasiados intentos. Espera 15 minutos para volver a intentar.' } });
  app.use(['/api/login', '/api/sesion', '/api/logout'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.post('/api/login', origenLocal, limiter, async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['correo', 'password'].includes(k)) ||
        typeof body.correo !== 'string' || typeof body.password !== 'string' || body.correo.length > 254 || body.password.length < 1 || body.password.length > 128) {
      return res.status(400).json({ ok: false, mensaje: 'Introduce un correo y una contraseña válidos.' });
    }
    try {
      const correo = body.correo.trim().toLowerCase();
      const usuario = await usuarios.findOne({ correo }, { collation: { locale: 'en', strength: 2 } });
      const hash = typeof usuario?.passwordHash === 'string' && usuario.passwordHash.startsWith('$argon2id$') ? usuario.passwordHash : dummyHash;
      let correcto = false;
      try { correcto = await argon2.verify(hash, body.password); } catch { correcto = false; }
      if (!usuario || usuario.estado !== 'activo' || hash === dummyHash || !correcto) {
        return res.status(401).json({ ok: false, mensaje: 'Correo o contraseña incorrectos, o cuenta no habilitada.' });
      }
      const anterior = leerToken(req);
      // Rotar el identificador después de autenticar: nunca reutilizar el recibido.
      if (anterior) await sesiones.deleteOne({ _id: digest(anterior) });
      const token = randomBytes(32).toString('hex');
      const ahora = new Date();
      await sesiones.insertOne({ _id: digest(token), usuarioId: usuario._id, creadoEn: ahora, expiraEn: new Date(ahora.getTime() + DURACION) });
      res.cookie(COOKIE, token, { ...cookieOptions, maxAge: DURACION });
      res.json({ ok: true, usuario: publico(usuario) });
    } catch {
      res.status(503).json({ ok: false, mensaje: 'No pudimos iniciar sesión. Intenta nuevamente.' });
    }
  });

  // Devuelve solo el perfil público. Nunca enviar el hash ni el identificador de sesión.
  app.get('/api/sesion', async (req, res) => {
    try {
      const token = leerToken(req);
      const sesion = token ? await sesiones.findOne({ _id: digest(token), expiraEn: { $gt: new Date() } }) : null;
      const usuario = sesion ? await usuarios.findOne({ _id: sesion.usuarioId }, { projection: { nombre: 1, apellido: 1, correo: 1, tipoCuenta: 1, estado: 1 } }) : null;
      if (!sesion || !usuario || usuario.estado !== 'activo') {
        if (token) await sesiones.deleteOne({ _id: digest(token) });
        res.clearCookie(COOKIE, cookieOptions);
        return res.status(401).json({ ok: false, mensaje: 'No hay una sesión activa.' });
      }
      res.json({ ok: true, usuario: publico(usuario) });
    } catch { res.status(503).json({ ok: false, mensaje: 'No pudimos comprobar tu sesión.' }); }
  });
  app.post('/api/logout', origenLocal, async (req, res) => {
    try {
      const token = leerToken(req);
      if (token) await sesiones.deleteOne({ _id: digest(token) });
      res.clearCookie(COOKIE, cookieOptions);
      res.json({ ok: true, mensaje: 'Sesión cerrada.' });
    } catch { res.status(503).json({ ok: false, mensaje: 'No pudimos cerrar la sesión. Intenta nuevamente.' }); }
  });
};

// Compartir la comprobación de sesión con las operaciones protegidas.
module.exports.origenLocal = origenLocal;
module.exports.autenticar = async function autenticar(req, db) {
  const token = leerToken(req);
  if (!token) return null;
  const sesion = await db.collection('sesiones_web').findOne({_id:digest(token),expiraEn:{$gt:new Date()}});
  if (!sesion) return null;
  return db.collection('usuarios').findOne({_id:sesion.usuarioId,estado:'activo'},{projection:{tipoCuenta:1}});
};
