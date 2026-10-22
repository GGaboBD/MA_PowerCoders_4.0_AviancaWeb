'use strict';
const { ObjectId } = require('mongodb');
const { autenticar } = require('./sesion');
module.exports = function registrarMisReservas(app, db) {
  app.get('/api/mis-reservas', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const usuario = await autenticar(req, db);
      if (!usuario) return res.status(401).json({ok:false,mensaje:'Inicia sesión para consultar tus reservas.'});
      if (usuario.tipoCuenta !== 'cliente') return res.status(403).json({ok:false,mensaje:'Esta sección está disponible para cuentas de cliente.'});
      const antes = req.query.antes;
      if (antes !== undefined && (typeof antes !== 'string' || !/^[a-f0-9]{24}$/i.test(antes))) return res.status(400).json({ok:false,mensaje:'Página de reservas no válida.'});
      // La identidad siempre procede de la sesión, nunca de un parámetro de URL.
      const filtro = {compradorId:usuario._id};
      if (antes) filtro._id={$lt:new ObjectId(antes)};
      const reservas=await db.collection('reservas').find(filtro).sort({_id:-1}).limit(11).maxTimeMS(10000).toArray();
      const hayMas=reservas.length>10;
      const resultado=[];
      for (const r of reservas.slice(0,10)) {
        const vuelo=await db.collection('vuelos').findOne({_id:r.vueloId},{projection:{codigo:1,origen:1,destino:1,salida:1,llegada:1,estado:1},maxTimeMS:10000});
        const boletos=await db.collection('boletos').find({reservaId:r._id,vueloId:r.vueloId}).sort({creadoEn:1,_id:1}).maxTimeMS(10000).toArray();
        const personas=boletos.length?await db.collection('pasajeros').find({_id:{$in:boletos.map(b=>b.pasajeroId)}},{projection:{nombres:1,apellidos:1}}).maxTimeMS(10000).toArray():[];
        const nombres=new Map(personas.map(p=>[String(p._id),`${p.nombres} ${p.apellidos}`]));
        resultado.push({id:String(r._id),localizador:r.localizador,estado:r.estado,creadaEn:r.creadaEn,
          puedeCancelar:Boolean(r.activa && ['pendiente','confirmada'].includes(r.estado) && vuelo && vuelo.salida>new Date() && !['salido','finalizado'].includes(vuelo.estado) && !boletos.some(b=>b.estado==='utilizado')),
          vuelo:vuelo?{codigo:vuelo.codigo,origen:vuelo.origen,destino:vuelo.destino,salida:vuelo.salida,llegada:vuelo.llegada,estado:vuelo.estado}:null,
          boletos:boletos.map(b=>({numero:b.numero,pasajero:nombres.get(String(b.pasajeroId))||'Pasajero no disponible',asiento:b.asiento,clase:b.clase,precio:b.precio.toString(),moneda:b.moneda,estado:b.estado}))});
      }
      res.json({ok:true,reservas:resultado,siguiente:hayMas?String(reservas[9]._id):null});
    } catch { res.status(503).json({ok:false,mensaje:'No pudimos consultar tus reservas. Intenta nuevamente.'}); }
  });
};
