// Configuración centralizada. Todos los secretos salen de variables de entorno (RNF-02, RS-11).
import path from 'path';

try {
  // El servidor Node propio y los scripts no pasan por Next: cargamos .env aquí.
  require('dotenv').config({ quiet: true });
} catch (_) {
  /* dotenv es opcional si las variables ya están definidas */
}

function str(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
function int(name, fallback) {
  const n = parseInt(process.env[name] as string, 10);
  return Number.isFinite(n) ? n : fallback;
}
function bool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'si'].includes(String(v).toLowerCase());
}

// Se evalúa en cada acceso para que las pruebas puedan cambiar process.env.
const config: any = {
  get nodeEnv() { return str('NODE_ENV', 'development'); },
  get isProd() { return this.nodeEnv === 'production'; },
  get appOrigin() { return str('APP_ORIGIN', 'http://localhost:3000'); },
  get cookieSecure() { return bool('COOKIE_SECURE', this.isProd); },
  get sessionTtlHours() { return int('SESSION_TTL_HOURS', 8); },
  get resetTtlMinutes() { return int('RESET_TOKEN_TTL_MINUTES', 30); },
  get bcryptRounds() { return int('BCRYPT_ROUNDS', 12); },
  get uploadDir() { return path.resolve(str('UPLOAD_DIR', './storage/uploads')); },
  get maxUploadBytes() { return int('MAX_UPLOAD_MB', 10) * 1024 * 1024; },
  ca: {
    get dir() { return path.resolve(str('CA_DIR', './ca-data')); },
    get offlineDir() { return path.resolve(str('CA_ROOT_OFFLINE_DIR', './ca-offline')); },
    get rootCertFile() { return path.resolve(str('CA_ROOT_CERT_FILE', './ca-data/root-ca.cert.pem')); },
    get issuingCertFile() { return path.resolve(str('CA_ISSUING_CERT_FILE', './ca-data/issuing-ca.cert.pem')); },
    get issuingKeyFile() { return path.resolve(str('CA_ISSUING_KEY_FILE', './ca-data/issuing-ca.key.pem')); },
    get rootCertB64() { return str('CA_ROOT_CERT_B64'); },
    get issuingCertB64() { return str('CA_ISSUING_CERT_B64'); },
    get issuingKeyB64() { return str('CA_ISSUING_KEY_B64'); },
  },
  payments: {
    get gateway() { return str('PAYMENT_GATEWAY', 'paypal'); },
    get env() { return str('PAYPAL_ENV', 'sandbox'); },
    get apiBase() { return str('PAYPAL_API_BASE', 'https://api-m.sandbox.paypal.com'); },
    get clientId() { return str('PAYPAL_CLIENT_ID'); },
    get clientSecret() { return str('PAYPAL_CLIENT_SECRET'); },
    get timeoutMs() { return int('PAYPAL_TIMEOUT_MS', 10000); },
    get orderTtlHours() { return int('PAYPAL_ORDER_TTL_HOURS', 3); },
  },
};

export { config };
