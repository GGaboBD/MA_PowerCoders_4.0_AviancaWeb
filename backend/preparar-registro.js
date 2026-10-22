'use strict';
const { MongoClient } = require('mongodb');

async function preparar() {
  let cliente;
  try {
    if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) throw new Error('Falta la configuración .env.');
    cliente = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await cliente.connect();
    const db = cliente.db(process.env.MONGODB_DB);
    const [info] = await db.listCollections({ name: 'usuarios' }).toArray();
    if (!info) throw new Error('No existe usuarios. Comprueba MONGODB_DB; no se creará otra base.');
    const validator = info.options?.validator;
    const schema = validator?.$jsonSchema || validator?.$and?.find(r => r.$jsonSchema)?.$jsonSchema;
    if (!schema?.properties?.passwordHash || !schema?.properties?.tipoCuenta || schema.additionalProperties !== false) {
      throw new Error('El esquema no coincide con el del proyecto. No se modificó el validador.');
    }
    const esperado = { bsonType: 'string', minLength: 1, maxLength: 80 };
    for (const campo of ['nombre', 'apellido']) {
      const actual = schema.properties[campo];
      if (actual && (actual.bsonType !== 'string' || actual.minLength !== 1 || actual.maxLength !== 80 || Object.keys(actual).length !== 3)) {
        throw new Error('Ya existe una definición diferente para nombre o apellido. Revisa el esquema antes de migrar.');
      }
    }
    if (!await db.collection('roles').findOne({ _id: 'cliente' })) throw new Error('Falta el rol cliente. Revisa el script original.');
    // La creación falla si hay duplicados; nunca los elimina ni los modifica.
    await db.collection('usuarios').createIndex({ correo: 1 }, { unique: true, name: 'correo_unico', collation: { locale: 'en', strength: 2 } });
    const cambio = !schema.properties.nombre || !schema.properties.apellido;
    schema.properties.nombre = { ...esperado };
    schema.properties.apellido = { ...esperado };
    // Son opcionales en la base para conservar cuentas existentes; la API los exige al registrar.
    if (cambio) await db.command({ collMod: 'usuarios', validator });
    console.log('Registro preparado: nombre y apellido admitidos; índice único de correo comprobado.');
    console.log('Los documentos y las demás reglas se conservaron.');
  } catch (error) {
    console.error('No se completó la preparación:', error.code || error.name);
    if (!error.code && error.name === 'Error') console.error(error.message);
    if (error.code === 13) console.error('La cuenta de conexión necesita permisos para modificar el validador con collMod.');
    if (error.code === 11000) console.error('Existen correos duplicados. No se borró ningún documento.');
    process.exitCode = 1;
  } finally { if (cliente) await cliente.close(); }
}
preparar();
