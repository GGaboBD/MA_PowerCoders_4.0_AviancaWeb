'use strict';
const express = require('express');
const path = require('node:path');
const { MongoClient } = require('mongodb');
const registrarVuelos = require('./vuelos');
const registrarDetalle = require('./detalle-vuelo');
const registrarRegistro = require('./registro');
const registrarSesion = require('./sesion');
const registrarReservas = require('./reservas');
const registrarMisReservas = require('./mis-reservas');
const registrarCancelacion = require('./cancelar-reserva');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const EN_RENDER = process.env.RENDER === 'true';
const HOST = EN_RENDER ? '0.0.0.0' : '127.0.0.1';

if (EN_RENDER) {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

async function iniciarServidor() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) {
    console.error('Falta MONGODB_URI o MONGODB_DB en .env');
    process.exitCode = 1;
    return;
  }
  let cliente;
  try {
    cliente = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await cliente.connect();
    const db = cliente.db(process.env.MONGODB_DB);
    await db.command({ ping: 1 });
    console.log('Conexión con MongoDB Atlas exitosa');
    app.locals.db = db;
    await registrarRegistro.comprobarEsquema(db);
    registrarRegistro(app, db);
    await registrarSesion(app, db);
    registrarVuelos(app, db);
    registrarDetalle(app, db);
    await registrarReservas(app, db, cliente);
    registrarMisReservas(app, db);
    registrarCancelacion(app, db, cliente);
    app.get('/api/salud', async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        await db.command({ ping: 1 });
        res.json({ ok: true, mensaje: 'La API funciona y tiene conexión con MongoDB' });
      } catch { res.status(503).json({ ok: false, mensaje: 'MongoDB no está disponible' }); }
    });
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
      res.status(status).json({ ok: false, mensaje: 'La solicitud no se pudo procesar. Revisa los datos enviados.' });
    });
    const servidor = app.listen(PORT, HOST, () => {
      console.log(`Servidor iniciado en el puerto ${PORT}`);
    });
    servidor.on('error', async error => {
      console.error('No se pudo iniciar el servidor:', error.code);
      await cliente.close();
      process.exitCode = 1;
    });
    function cerrarServidor() {
  servidor.close(async () => {
    await cliente.close();
  });
}

process.once('SIGINT', cerrarServidor);
process.once('SIGTERM', cerrarServidor);
  } catch (error) {
    console.error('No se pudo conectar con MongoDB:', error.name, error.code || 'sin código');
    if (error.name === 'Error' && !error.code) console.error(error.message);
    if (cliente) await cliente.close();
    process.exitCode = 1;
  }
}
iniciarServidor();
