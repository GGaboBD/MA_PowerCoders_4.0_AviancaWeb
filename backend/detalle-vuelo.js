'use strict';
const { ObjectId } = require('mongodb');
const { presentar, validar } = require('./vuelos');

module.exports = function registrarDetalle(app, db) {
  app.get('/api/vuelos/:id', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { cabina, pasajeros } = req.query;
    if (!/^[a-f0-9]{24}$/i.test(req.params.id) ||
        !['ejecutiva', 'primera'].includes(cabina) ||
        typeof pasajeros !== 'string' || !/^[1-6]$/.test(pasajeros)) {
      return res.status(400).json({ ok: false, mensaje: 'Selecciona un vuelo, cabina y cantidad de pasajeros válidos desde el buscador.' });
    }
    try {
      const [vuelo] = await db.collection('vuelos').aggregate([
        { $match: { _id: new ObjectId(req.params.id) } },
        { $lookup: { from: 'boletos', let: { vuelo: '$_id' }, pipeline: [
          { $match: { vigente: true, $expr: { $eq: ['$vueloId', '$$vuelo'] } } },
          { $project: { _id: 0, asiento: 1 } },
        ], as: 'ocupados' } },
        { $project: { codigo: 1, origen: 1, destino: 1, salida: 1, llegada: 1,
          estado: 1, tarifas: 1, moneda: 1, asientos: 1, ocupados: 1 } },
      ], { maxTimeMS: 10000 }).toArray();
      if (!vuelo) return res.status(404).json({ ok: false, mensaje: 'No encontramos ese vuelo. Vuelve al buscador.' });
      if (vuelo.estado !== 'ventas_abiertas' || new Date(vuelo.salida) <= new Date()) {
        return res.status(409).json({ ok: false, mensaje: 'Este vuelo ya no admite reservas. Vuelve al buscador.' });
      }
      // Obtener la fecha local del origen sin modificar la regla diaViaje de las reservas.
      const zonas = { SAL: 'America/El_Salvador', MIA: 'America/New_York', BOG: 'America/Bogota', MDE: 'America/Bogota', CLO: 'America/Bogota', CTG: 'America/Bogota' };
      if (!Object.hasOwn(zonas, vuelo.origen) || !Object.hasOwn(zonas, vuelo.destino)) {
        return res.status(422).json({ ok: false, mensaje: 'El aeropuerto de este vuelo aún no está configurado.' });
      }
      const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: zonas[vuelo.origen], year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date(vuelo.salida)).map(p => [p.type, p.value]));
      const fecha = `${partes.year}-${partes.month}-${partes.day}`;
      const filtro = validar({ origen: vuelo.origen, destino: vuelo.destino, fecha, cabina, pasajeros });
      const detalle = presentar(vuelo, filtro, new Date());
      if (!detalle) return res.status(409).json({ ok: false, mensaje: 'La tarifa o la cantidad de asientos disponibles cambió. Vuelve al buscador.' });
      const ocupados = new Set(vuelo.ocupados.map(b => b.asiento));
      const asientos = vuelo.asientos.filter(a => a.clase === cabina).map(a => ({
        codigo: a.codigo, clase: a.clase, disponible: !ocupados.has(a.codigo),
      }));
      res.json({ ok: true, vuelo: { ...detalle, asientos } });
    } catch {
      res.status(503).json({ ok: false, mensaje: 'No pudimos consultar el vuelo. Intenta nuevamente.' });
    }
  });
};
