'use strict';
const {ObjectId}=require('mongodb');
const {autenticar,origenLocal}=require('./sesion');
const fallo=(status,mensaje)=>Object.assign(new Error(mensaje),{status});
async function cancelar(db,cliente,compradorId,id){
  const session=cliente.startSession();
  try{return await session.withTransaction(async()=>{
    const options={session};
    const reserva=await db.collection('reservas').findOne({_id:id,compradorId},options);
    if(!reserva)throw fallo(404,'No encontramos esa reserva en tu cuenta.');
    // Reintentar una cancelación confirmada no escribe ni duplica la auditoría.
    if(reserva.estado==='cancelada' && reserva.activa===false)return {ok:true,localizador:reserva.localizador,mensaje:'La reserva ya está cancelada.'};
    if(!reserva.activa || !['pendiente','confirmada'].includes(reserva.estado))throw fallo(409,'Esta reserva no admite cancelación.');
    const vuelo=await db.collection('vuelos').findOne({_id:reserva.vueloId},options);
    if(!vuelo || vuelo.salida<=new Date() || ['salido','finalizado'].includes(vuelo.estado))throw fallo(409,'Solo puedes cancelar antes de la salida del vuelo.');
    if(await db.collection('boletos').findOne({reservaId:id,estado:'utilizado'},options))throw fallo(409,'La reserva contiene un boleto utilizado y no puede cancelarse.');
    // Compra y cancelación escriben el mismo vuelo para resolver carreras concurrentes.
    const lock=await db.collection('vuelos').updateOne({_id:vuelo._id,salida:{$gt:new Date()},estado:{$nin:['salido','finalizado']}},{$inc:{versionInventario:1}},options);
    if(lock.modifiedCount!==1)throw fallo(409,'El vuelo ya no admite cancelación.');
    await db.collection('boletos').updateMany({reservaId:id},{$set:{estado:'cancelado',vigente:false}},options);
    await db.collection('reservas').updateOne({_id:id,compradorId},{$set:{estado:'cancelada',activa:false}},options);
    await db.collection('auditoria').insertOne({_id:new ObjectId(),actorId:compradorId,accion:'reserva_demo.cancelar',coleccion:'reservas',documentoId:id,fecha:new Date()},options);
    return {ok:true,localizador:reserva.localizador,mensaje:'Reserva cancelada. Se liberaron sus asientos y el día de viaje. El historial se conserva.'};
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:15000});}
  finally{await session.endSession();}
}
module.exports=function registrarCancelacion(app,db,cliente){
  app.post('/api/reservas/:id/cancelar',origenLocal,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{
      const usuario=await autenticar(req,db);
      if(!usuario)throw fallo(401,'Inicia sesión para cancelar tu reserva.');
      if(usuario.tipoCuenta!=='cliente')throw fallo(403,'Esta operación requiere una cuenta de cliente.');
      if(!/^[a-f0-9]{24}$/i.test(req.params.id))throw fallo(400,'El identificador de reserva no es válido.');
      if(req.body?.confirmar!==true)throw fallo(400,'Confirma que deseas cancelar todos los boletos de esta reserva.');
      res.json(await cancelar(db,cliente,usuario._id,new ObjectId(req.params.id)));
    }catch(e){if(!e.status)console.error('Cancelación:',e.name,e.code||'sin código');res.status(e.status||503).json({ok:false,mensaje:e.status?e.message:'No pudimos comprobar el resultado. Actualiza Mis reservas o reintenta la cancelación.'});}
  });
};
module.exports.cancelar=cancelar;
