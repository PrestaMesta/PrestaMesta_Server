// Variables de entorno EXCLUSIVAS de pruebas. Nunca deben coincidir con las de un .env de
// desarrollo/produccion (Checkpoint 2, correccion del usuario: test y produccion deben usar
// JWT_SECRET distintos). dotenv.config() en config/env.js no sobreescribe variables que ya
// existan en process.env, asi que definirlas aqui (setupFiles corre antes que cualquier
// require de config/env.js) garantiza que ningun .env real se use durante los tests.
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';

process.env.MYSQL_HOST = 'localhost';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_USER = 'test_user';
process.env.MYSQL_PASSWORD = 'test_password';
process.env.MYSQL_DATABASE = 'prestamesta_test';

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/prestamesta_test';

process.env.JWT_SECRET = 'solo-para-pruebas-nunca-usar-en-produccion-0123456789';
process.env.JWT_EXPIRES_IN = '8h';
process.env.JWT_ISS = 'prestamesta-api-test';
process.env.JWT_AUD_CLIENTE = 'prestamesta-client-test';
process.env.JWT_AUD_ADMIN = 'prestamesta-admin-test';

process.env.CORS_ORIGINS = 'http://localhost:4200,http://localhost:8100';

// Alto a proposito: no se quiere que otros archivos de prueba que llaman a
// POST /prestamos/solicitar unas pocas veces disparen el limite por accidente.
// tests/http/solicitudRateLimit.test.js sobreescribe esto a un valor bajo antes de
// requerir app.js, especificamente para probar el limite.
process.env.SOLICITUD_RATE_LIMIT_WINDOW_MS = '3600000';
process.env.SOLICITUD_RATE_LIMIT_MAX = '100';
