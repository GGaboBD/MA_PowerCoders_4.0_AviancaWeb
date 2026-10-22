(() => {
  'use strict';
  const list=document.querySelector('#lista-reservas'),status=document.querySelector('#reservas-estado'),login=document.querySelector('#acceder-reservas');
  const more=document.querySelector('#mas-reservas'),refresh=document.querySelector('#actualizar-reservas');
  let cursor=null,version=0,controller=null,userId=null;
  const dialog=document.querySelector('#dialog-cancelar'),cancelStatus=document.querySelector('#cancelar-estado');
  const keep=document.querySelector('#conservar-reserva'),confirm=document.querySelector('#confirmar-cancelacion');
  let selected=null,cancelBusy=false,operation=0;
  function closeCancellation(){operation++;selected=null;cancelBusy=false;dialog.close();keep.disabled=false;confirm.disabled=false;}
  keep.addEventListener('click',closeCancellation);
  dialog.addEventListener('cancel',e=>{if(cancelBusy)e.preventDefault();else closeCancellation();});
  confirm.addEventListener('click',async()=>{
    if(!selected||cancelBusy)return;
    const current=++operation,id=selected.id;
    cancelBusy=true;keep.disabled=true;confirm.disabled=true;cancelStatus.textContent='Cancelando la reserva…';
    try{
      const response=await fetch(`/api/reservas/${encodeURIComponent(id)}/cancelar`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmar:true}),signal:AbortSignal.timeout(30000)});
      const data=await response.json();if(current!==operation)return;
      if(!response.ok||!data.ok)throw new Error(data.mensaje||'No pudimos cancelar la reserva.');
      closeCancellation();await load();status.textContent=data.mensaje;status.tabIndex=-1;status.focus();
    }catch(e){if(current!==operation)return;cancelStatus.textContent=e.name==='TimeoutError'||e instanceof TypeError?'No pudimos comprobar el resultado. Puedes cerrar este aviso y actualizar la lista, o reintentar sin duplicar la cancelación.':e.message;}
    finally{if(current===operation){cancelBusy=false;keep.disabled=false;confirm.disabled=false;}}
  });
  const cities={SAL:'San Salvador',BOG:'Bogotá',MIA:'Miami',MDE:'Medellín',CLO:'Cali',CTG:'Cartagena'};
  const zones={SAL:'America/El_Salvador',MIA:'America/New_York',BOG:'America/Bogota',MDE:'America/Bogota',CLO:'America/Bogota',CTG:'America/Bogota'};
  const labels={confirmada:'Confirmada',pendiente:'Pendiente',completada:'Completada',cancelada:'Cancelada',reservado:'Reservado',emitido:'Emitido',utilizado:'Utilizado',cancelado:'Cancelado',ejecutiva:'Ejecutiva',primera:'Primera clase',ventas_abiertas:'Ventas abiertas',ventas_cerradas:'Ventas cerradas',salido:'En viaje',finalizado:'Finalizado'};
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const money=(value,currency)=>new Intl.NumberFormat('es-SV',{style:'currency',currency,currencyDisplay:'code'}).format(Number(value));
  const date=(value,airport)=>new Intl.DateTimeFormat('es-SV',{dateStyle:'medium',timeStyle:'short',timeZone:zones[airport]||'UTC'}).format(new Date(value));
  function card(r){
    const article=el('article',undefined,'viaje-tarjeta'),head=el('header',undefined,'viaje-cabecera'),title=el('div');
    title.append(el('span',`LOCALIZADOR · ${r.localizador}`,'viaje-localizador'));
    const f=r.vuelo;
    title.append(el('h2',f?`${cities[f.origen]||f.origen} → ${cities[f.destino]||f.destino}`:'Información de vuelo no disponible'));
    if(f)title.append(el('p',`${f.codigo} · ${labels[f.estado]||f.estado}`));
    head.append(title,el('span',labels[r.estado]||r.estado,'viaje-estado'));
    const body=el('div',undefined,'viaje-cuerpo');
    if(f){const times=el('div',undefined,'viaje-fechas');for(const [label,value,airport]of [['Salida',f.salida,f.origen],['Llegada',f.llegada,f.destino]]){const p=el('p');p.append(el('span',`${label} · hora local de ${airport}`),el('b',date(value,airport)));times.append(p);}body.append(times);}
    const wrap=el('div',undefined,'viaje-tabla-contenedor'),table=el('table',undefined,'viaje-tabla'),thead=el('thead'),tr=el('tr');
    for(const text of ['Pasajero / boleto','Asiento','Cabina','Estado','Importe']){const th=el('th',text);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);
    const tbody=el('tbody');const totals=new Map();
    for(const t of r.boletos){const row=el('tr'),name=el('td',t.pasajero);name.append(el('small',t.numero));const seat=el('td');seat.append(el('strong',t.asiento));row.append(name,seat,el('td',labels[t.clase]||t.clase),el('td',labels[t.estado]||t.estado),el('td',money(t.precio,t.moneda)));tbody.append(row);
      if(t.estado!=='cancelado')totals.set(t.moneda,(totals.get(t.moneda)||0)+Number(t.precio));}
    table.append(tbody);wrap.append(table);body.append(wrap);
    if(!r.boletos.length)body.append(el('p','Esta reserva no tiene boletos registrados.'));
    for(const [currency,total]of totals)body.append(el('p',`Total de boletos no cancelados · ${money(total,currency)}`,'viaje-total'));
    if(r.estado==='cancelada')article.classList.add('viaje-cancelado');
    if(r.puedeCancelar){const button=el('button','Cancelar reserva','boton boton-contorno cancelar-reserva');button.type='button';
      button.addEventListener('click',()=>{selected=r;cancelStatus.textContent='';document.querySelector('#cancelar-detalle').textContent=`Reserva ${r.localizador} · ${r.boletos.length} boleto(s).`;dialog.showModal();keep.focus();});body.append(button);}
    article.append(head,body);return article;
  }
  async function load(append=false){
    const current=++version;controller?.abort();controller=new AbortController();
    const activeController=controller;
    const timeout=setTimeout(()=>activeController.abort(),15000);
    refresh.disabled=true;more.disabled=true;login.hidden=true;
    if(!append){list.replaceChildren();cursor=null;more.hidden=true;}
    status.textContent='Consultando tus reservas…';
    try{
      const response=await fetch('/api/mis-reservas'+(append&&cursor?'?antes='+encodeURIComponent(cursor):''),{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      const data=await response.json();if(current!==version)return;
      if(response.status===401||response.status===403){list.replaceChildren();cursor=null;more.hidden=true;login.hidden=response.status!==401;status.textContent=data.mensaje;return;}
      if(!response.ok||!data.ok)throw new Error(data.mensaje||'No pudimos cargar tus reservas.');
      for(const r of data.reservas)list.append(card(r));cursor=data.siguiente;more.hidden=!cursor;
      status.textContent=list.children.length?`${list.children.length} reserva(s) mostrada(s).`:'Todavía no tienes reservas. Busca un vuelo para empezar.';
    }catch(e){if(current!==version)return;status.textContent=e.name==='AbortError'?'La consulta tardó demasiado. Pulsa Actualizar para reintentar.':e.message;}
    finally{clearTimeout(timeout);if(current===version){refresh.disabled=false;more.disabled=false;}}
  }
  refresh.addEventListener('click',()=>load());more.addEventListener('click',()=>load(true));
  window.addEventListener('sesion-cambio',event=>{
    const id=event.detail?.id||null;
    if(!id){closeCancellation();++version;controller?.abort();userId=null;list.replaceChildren();more.hidden=true;cursor=null;login.hidden=false;status.textContent='Inicia sesión para consultar tus reservas.';refresh.disabled=false;return;}
    if(userId!==id){closeCancellation();userId=id;load();}
  });
  window.addEventListener('pageshow',e=>{if(e.persisted)load();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  load();
})();
