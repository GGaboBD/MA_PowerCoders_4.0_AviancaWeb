'use strict';

const zonas = {
  SAL: 'America/El_Salvador', MIA: 'America/New_York',
  BOG: 'America/Bogota', MDE: 'America/Bogota',
  CLO: 'America/Bogota', CTG: 'America/Bogota',
};

function horarioLocal(fecha, zona) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(fecha)).map(p => [p.type, p.value]));
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

function validar(query) {
  const { origen, destino, fecha, hora = '00:00', cabina = 'ejecutiva', pasajeros = '1' } = query;
  if (typeof origen !== 'string' || !Object.hasOwn(zonas, origen) ||
      typeof destino !== 'string' || !Object.hasOwn(zonas, destino) || origen === destino ||
      typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      typeof hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora) ||
      !['ejecutiva', 'primera'].includes(cabina) ||
      typeof pasajeros !== 'string' || !/^[1-6]$/.test(pasajeros)) {
    throw new Error('Revisa origen, destino, fecha, hora, cabina y pasajeros.');
  }
  const dia = new Date(`${fecha}T00:00:00Z`);
  if (!Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha) {
    throw new Error('La fecha no es válida.');
  }
  return { origen, destino, fecha, hora, cabina, pasajeros: Number(pasajeros), dia };
}

function presentar(vuelo, filtro, ahora) {
  const salida = horarioLocal(vuelo.salida, zonas[filtro.origen]);
  if (salida.fecha !== filtro.fecha || salida.hora < filtro.hora || new Date(vuelo.salida) <= ahora) return null;
  const ocupados = new Set((vuelo.ocupados || []).map(b => b.asiento));
  const disponibles = (vuelo.asientos || []).filter(a => a.clase === filtro.cabina && !ocupados.has(a.codigo)).length;
  if (disponibles < filtro.pasajeros) return null;
  const precio = vuelo.tarifas?.[filtro.cabina]?.toString();
  if (!precio || !Number.isFinite(Number(precio)) || Number(precio) < 0 || !['USD', 'COP'].includes(vuelo.moneda)) return null;
  return {
    id: String(vuelo._id), codigo: vuelo.codigo, origen: vuelo.origen, destino: vuelo.destino,
    salida: new Date(vuelo.salida).toISOString(), llegada: new Date(vuelo.llegada).toISOString(),
    fecha: salida.fecha, hora: salida.hora, zonaOrigen: zonas[filtro.origen],
    llegadaLocal: horarioLocal(vuelo.llegada, zonas[filtro.destino]), zonaDestino: zonas[filtro.destino],
    duracionMinutos: Math.round((new Date(vuelo.llegada) - new Date(vuelo.salida)) / 60000),
    cabina: filtro.cabina, precio, moneda: vuelo.moneda, disponibles,
  };
}

module.exports = function registrarVuelos(app, db) {
  app.get('/api/vuelos', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // Conserva la consulta breve usada durante la primera prueba de conexión.
    if (Object.keys(req.query).length === 0) {
      try {
        const vuelos = await db.collection('vuelos').find({}, { projection: {
          codigo: 1, origen: 1, destino: 1, salida: 1, llegada: 1, estado: 1,
        } }).limit(20).toArray();
        return res.json({ ok: true, cantidad: vuelos.length, vuelos });
      } catch { return res.status(503).json({ ok: false, mensaje: 'No se pudieron consultar los vuelos.' }); }
    }
    let filtro;
    try { filtro = validar(req.query); }
    catch (error) { return res.status(400).json({ ok: false, mensaje: error.message }); }
    try {
      // Ventana UTC amplia; el filtro exacto de fecha/hora usa la zona del origen.
      const inicio = filtro.dia.getTime();
      const candidatos = db.collection('vuelos').aggregate([
        { $match: { origen: filtro.origen, destino: filtro.destino, estado: 'ventas_abiertas',
          salida: { $gte: new Date(inicio - 14 * 3600000), $lt: new Date(inicio + 38 * 3600000) } } },
        { $sort: { salida: 1, _id: 1 } },
        { $lookup: { from: 'boletos', let: { vuelo: '$_id' }, pipeline: [
          { $match: { vigente: true, $expr: { $eq: ['$vueloId', '$$vuelo'] } } },
          { $project: { _id: 0, asiento: 1 } },
        ], as: 'ocupados' } },
        { $project: { codigo: 1, origen: 1, destino: 1, salida: 1, llegada: 1,
          tarifas: 1, moneda: 1, asientos: 1, ocupados: 1 } },
      ], { maxTimeMS: 10000 });
      const vuelos = [];
      const ahora = new Date();
      try {
        for await (const vuelo of candidatos) {
          const resultado = presentar(vuelo, filtro, ahora);
          if (resultado) vuelos.push(resultado);
          if (vuelos.length === 101) break;
        }
      } finally { await candidatos.close(); }
      res.json({ ok: true, cantidad: Math.min(vuelos.length, 100), hayMas: vuelos.length > 100, vuelos: vuelos.slice(0, 100) });
    } catch {
      res.status(503).json({ ok: false, mensaje: 'No se pudieron consultar los vuelos. Intenta nuevamente.' });
    }
  });
};
module.exports.validar = validar;
module.exports.presentar = presentar;
