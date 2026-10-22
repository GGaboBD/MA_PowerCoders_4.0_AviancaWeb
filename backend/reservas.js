'use strict';
const { ObjectId } = require('mongodb');
const { randomUUID, createHash } = require('node:crypto');
const { origenLocal, autenticar } = require('./sesion');
const fallo = (status, mensaje) => Object.assign(new Error(mensaje), { status });
const texto = (v, max = 80) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max && !/[\u0000-\u001f]/.test(v);
function validar(b) {
  if (!b || !/^[a-f0-9]{24}$/i.test(b.vueloId || '') || !['ejecutiva','primera'].includes(b.clase) ||
      !/^[a-f0-9-]{36}$/i.test(b.solicitudId || '') || !Array.isArray(b.pasajeros) || b.pasajeros.length < 1 || b.pasajeros.length > 6 ||
      typeof b.precioAceptado !== 'string' || typeof b.salidaAceptada !== 'string' || typeof b.monedaAceptada !== 'string') throw fallo(400,'Revisa los datos de la reserva.');
  const personas = b.pasajeros.map(p => {
    if (!p || !texto(p.nombres) || !texto(p.apellidos) || !texto(p.asiento,10) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(p.fechaNacimiento || '') || !['pasaporte','identidad'].includes(p.documento?.tipo) ||
        !/^[A-Z]{2}$/.test(p.documento?.paisEmisor || '') || !texto(p.documento?.numero,40)) throw fallo(400,'Completa la identidad y el asiento de cada pasajero.');
    const fecha = new Date(p.fechaNacimiento + 'T00:00:00Z');
    if (!Number.isFinite(+fecha) || fecha.toISOString().slice(0,10) !== p.fechaNacimiento || fecha > new Date() || fecha < new Date('1900-01-01')) throw fallo(400,'Fecha de nacimiento no válida.');
    const pr = p.preferencias;
    if (!pr || !['sin_preferencia','estandar','vegetariana','vegana','sin_gluten','otra'].includes(pr.comida) || typeof pr.noMolestar !== 'boolean' ||
        !Array.isArray(pr.alergias) || pr.alergias.length > 20 || pr.alergias.some(a => !texto(a,80)) ||
        typeof pr.bebida !== 'string' || pr.bebida.length > 80 || typeof pr.notas !== 'string' || pr.notas.length > 1000) throw fallo(400,'Revisa las preferencias del pasajero.');
    return { nombres:p.nombres.trim(), apellidos:p.apellidos.trim(), fechaNacimiento:fecha,
      documento:{tipo:p.documento.tipo,paisEmisor:p.documento.paisEmisor,numero:p.documento.numero.trim().toUpperCase()}, asiento:p.asiento.trim(),
      preferencias:{comida:pr.comida,noMolestar:pr.noMolestar,alergias:[...new Set(pr.alergias.map(a=>a.trim()))],bebida:pr.bebida.trim(),notas:pr.notas.trim()} };
  });
  if (new Set(personas.map(p=>p.asiento)).size !== personas.length || new Set(personas.map(p=>JSON.stringify(p.documento))).size !== personas.length) throw fallo(400,'No repitas pasajeros ni asientos en una compra.');
  return { vueloId:b.vueloId.toLowerCase(), clase:b.clase, solicitudId:b.solicitudId.toLowerCase(), precioAceptado:b.precioAceptado, monedaAceptada:b.monedaAceptada, salidaAceptada:b.salidaAceptada, pasajeros:personas };
}
async function preparar(db) {
  // No alterar los validadores existentes ni eliminar registros.
  for (const name of ['pasajeros','reservas','boletos','vuelos','auditoria']) {
    if (!(await db.listCollections({name}).toArray()).length) throw new Error(`Falta la colección ${name}. Ejecuta primero la estructura del proyecto.`);
  }
  await db.collection('reservas').createIndex({compradorId:1,diaViaje:1},{unique:true,partialFilterExpression:{activa:true},name:'un_vuelo_por_comprador_y_dia'});
  await db.collection('reservas').createIndex({localizador:1},{unique:true,name:'localizador_unico'});
  await db.collection('boletos').createIndex({vueloId:1,asiento:1},{unique:true,partialFilterExpression:{vigente:true},name:'asiento_ocupado_una_vez'});
  await db.collection('boletos').createIndex({vueloId:1,pasajeroId:1},{unique:true,partialFilterExpression:{vigente:true},name:'pasajero_una_vez_por_vuelo'});
  await db.collection('boletos').createIndex({numero:1},{unique:true,name:'boleto_unico'});
  await db.collection('pasajeros').createIndex({'documento.tipo':1,'documento.paisEmisor':1,'documento.numero':1},{unique:true,name:'documento_pasajero_unico'});
  // El _id compuesto por comprador y solicitud impide duplicar una confirmación.
  if (!(await db.listCollections({name:'solicitudes_reserva'}).toArray()).length) await db.createCollection('solicitudes_reserva');
}
async function comprar(db, cliente, compradorId, datos) {
  const session = cliente.startSession();
  const key = `${compradorId}:${datos.solicitudId}`;
  const huella = createHash('sha256').update(JSON.stringify(datos)).digest('hex');
  try {
    return await session.withTransaction(async () => {
      const opts = {session};
      const previo = await db.collection('solicitudes_reserva').findOne({_id:key},opts);
      if (previo) {
        if (previo.huella !== huella) throw fallo(409,'Este intento ya se usó con otros datos. Revisa la compra nuevamente.');
        return previo.resultado;
      }
      const vueloId = new ObjectId(datos.vueloId);
      const vuelo = await db.collection('vuelos').findOne({_id:vueloId},opts);
      if (!vuelo || vuelo.estado !== 'ventas_abiertas' || vuelo.salida <= new Date()) throw fallo(409,'El vuelo ya no está disponible.');
      if (vuelo.tarifas[datos.clase].toString() !== datos.precioAceptado || vuelo.moneda !== datos.monedaAceptada || vuelo.salida.toISOString() !== datos.salidaAceptada) throw fallo(409,'La tarifa o el horario cambió. Revisa nuevamente el vuelo.');
      const dia = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(vuelo.salida);
      if (dia !== vuelo.diaViaje) throw fallo(409,'El vuelo requiere una revisión de su fecha.');
      // Todas las ventas escriben el vuelo: los conflictos se reintentan con una nueva instantánea.
      await db.collection('vuelos').updateOne({_id:vueloId},{$inc:{versionInventario:1}},opts);
      const asientos = datos.pasajeros.map(p=>p.asiento);
      if (asientos.some(a=>!vuelo.asientos.some(s=>s.codigo===a && s.clase===datos.clase))) throw fallo(400,'Un asiento no pertenece a la cabina seleccionada.');
      if (await db.collection('boletos').findOne({vueloId,vigente:true,asiento:{$in:asientos}},opts)) throw fallo(409,'Un asiento acaba de ocuparse. Elige otro en el mapa.');
      let reserva = await db.collection('reservas').findOne({compradorId,diaViaje:dia,activa:true},opts);
      if (reserva && !reserva.vueloId.equals(vueloId)) throw fallo(409,'Ya tienes una reserva para otro vuelo el mismo día de viaje (America/Bogota).');
      if (reserva && !['pendiente','confirmada'].includes(reserva.estado)) throw fallo(409,'Esta reserva ya no admite nuevos boletos.');
      const ahora = new Date();
      if (!reserva) {
        reserva = {_id:new ObjectId(),localizador:'DEMO-'+randomUUID().slice(0,8).toUpperCase(),compradorId,vueloId,diaViaje:dia,estado:'confirmada',activa:true,creadaEn:ahora};
        await db.collection('reservas').insertOne(reserva,opts);
      }
      const boletos = [];
      for (const p of datos.pasajeros) {
        let persona = await db.collection('pasajeros').findOne({'documento.tipo':p.documento.tipo,'documento.paisEmisor':p.documento.paisEmisor,'documento.numero':p.documento.numero},opts);
        if (persona) {
          // Reutilizar solo una ficha ya usada por este comprador, o su ficha personal.
          const propias = await db.collection('reservas').find({compradorId},opts).project({_id:1}).toArray();
          const autorizado = persona.usuarioTitularId?.equals(compradorId) || await db.collection('boletos').findOne({pasajeroId:persona._id,reservaId:{$in:propias.map(r=>r._id)}},opts);
          if (!autorizado || persona.nombres !== p.nombres || persona.apellidos !== p.apellidos || +persona.fechaNacimiento !== +p.fechaNacimiento) throw fallo(409,'No podemos reutilizar ese documento con estos datos o esta cuenta. Usa datos ficticios nuevos para esta prueba.');
        } else {
          persona = {_id:new ObjectId(),nombres:p.nombres,apellidos:p.apellidos,fechaNacimiento:p.fechaNacimiento,documento:p.documento,preferencias:p.preferencias,preferenciasActualizadasEn:ahora};
          await db.collection('pasajeros').insertOne(persona,opts);
        }
        if (await db.collection('boletos').findOne({vueloId,pasajeroId:persona._id,vigente:true},opts)) throw fallo(409,'Uno de los pasajeros ya tiene boleto para este vuelo.');
        const boleto = {_id:new ObjectId(),numero:'DEMO-'+randomUUID(),reservaId:reserva._id,vueloId,pasajeroId:persona._id,asiento:p.asiento,clase:datos.clase,precio:vuelo.tarifas[datos.clase],moneda:vuelo.moneda,estado:'reservado',vigente:true,preferenciasViaje:p.preferencias,creadoEn:ahora};
        await db.collection('boletos').insertOne(boleto,opts);
        boletos.push({numero:boleto.numero,asiento:boleto.asiento,precio:boleto.precio.toString(),moneda:boleto.moneda});
      }
      await db.collection('auditoria').insertOne({_id:new ObjectId(),actorId:compradorId,accion:'reserva_demo.confirmar',coleccion:'reservas',documentoId:reserva._id,fecha:ahora},opts);
      const resultado = {ok:true,localizador:reserva.localizador,reservaId:String(reserva._id),boletos,mensaje:'Reserva de prueba guardada. No se realizó ningún cobro.'};
      await db.collection('solicitudes_reserva').insertOne({_id:key,huella,resultado,creadaEn:ahora},opts);
      return resultado;
    },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:15000});
  } finally { await session.endSession(); }
}
module.exports = async function registrarReservas(app,db,cliente) {
  await preparar(db);
  app.post('/api/reservas',origenLocal,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try {
      const usuario = await autenticar(req,db);
      if (!usuario) throw fallo(401,'Inicia sesión para confirmar la reserva.');
      if (usuario.tipoCuenta !== 'cliente') throw fallo(403,'Esta compra requiere una cuenta de cliente.');
      const datos = validar(req.body);
      // Repetir una colisión concurrente de índices para consultar el resultado ya confirmado.
      let resultado;
      for (let i=0;i<3;i++) {
        try { resultado=await comprar(db,cliente,usuario._id,datos); break; }
        catch(e) { if(e.code!==11000 || i===2) throw e; }
      }
      res.json(resultado);
    } catch(e) {
      const status=e.status || (e.code===11000?409:503);
      if (!e.status) console.error('Reserva:',e.name,e.code || 'sin código');
      res.status(status).json({ok:false,mensaje:e.status?e.message:e.code===11000?'Hay un conflicto con otra reserva. Revisa pasajeros, fecha y asientos.':'No pudimos confirmar el resultado. Reintenta con los mismos datos para evitar duplicados.'});
    }
  });
};
module.exports.validar=validar;
module.exports.comprar=comprar;
