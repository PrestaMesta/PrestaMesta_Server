const mongoose = require('mongoose');
const env = require('./env');

const connectMongo = async () => {
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log('MongoDB conectado correctamente');
  } catch (error) {
    // No se imprime env.MONGO_URI ni error.message crudo: podrian contener credenciales.
    console.error(
      `Error al conectar MongoDB (${error.name || 'Error'}${error.code ? `, code=${error.code}` : ''}). Revisa la configuracion de MONGO_URI.`
    );
    process.exit(1);
  }
};

module.exports = connectMongo;