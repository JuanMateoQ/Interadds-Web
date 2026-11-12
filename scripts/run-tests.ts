// Ejecutor de pruebas en UN comando:  npm test
//  1. Usa la base TEST_DATABASE_URL (su nombre debe terminar en "_test": las pruebas la vacían).
//  2. Aplica las migraciones (omite con SKIP_MIGRATE=1) y crea una CA temporal.
//  3. Corre todos los archivos tests/*.test.ts con el ejecutor nativo de Node (sin dependencias extra).
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import '../src/lib/env';

const root = path.resolve(__dirname, '..');
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('Falta TEST_DATABASE_URL en el .env (por ejemplo postgresql://postgres:postgres@localhost:5432/interadds_test).');
  process.exit(1);
}
const dbName = new URL(testUrl).pathname.replace(/^\//, '');
if (!dbName.endsWith('_test')) {
  console.error(`Por seguridad, la base de pruebas debe terminar en "_test" (recibí "${dbName}"): las pruebas vacían sus tablas.`);
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'interadds-test-'));
const env: any = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: testUrl,
  BCRYPT_ROUNDS: '4',
  PAYMENT_GATEWAY: 'fake',
  PAYPAL_ENV: 'sandbox',
  APP_ORIGIN: 'http://localhost:3000',
  CA_DIR: path.join(tmp, 'ca-data'),
  CA_ROOT_CERT_FILE: path.join(tmp, 'ca-data', 'root-ca.cert.pem'),
  CA_ISSUING_CERT_FILE: path.join(tmp, 'ca-data', 'issuing-ca.cert.pem'),
  CA_ISSUING_KEY_FILE: path.join(tmp, 'ca-data', 'issuing-ca.key.pem'),
  CA_ISSUING_KEY_B64: '',
  CA_ISSUING_CERT_B64: '',
  CA_ROOT_CERT_B64: '',
  CA_ROOT_OFFLINE_DIR: path.join(tmp, 'ca-offline'),
  UPLOAD_DIR: path.join(tmp, 'uploads'),
  MAX_UPLOAD_MB: '1',
};

const win = process.platform === 'win32';
if (!process.env.SKIP_MIGRATE) {
  console.log(`> Aplicando migraciones a ${dbName}...`);
  const m = spawnSync(win ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy'], { cwd: root, env, stdio: 'inherit', shell: win });
  if (m.status !== 0) {
    console.error('No se pudieron aplicar las migraciones. ¿Está PostgreSQL encendido y existe la base de pruebas?');
    process.exit(m.status || 1);
  }
}

const dir = path.join(root, 'tests');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.ts')).sort().map((f) => path.join('tests', f));
console.log(`> Ejecutando ${files.length} archivos de prueba...\n`);
const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-force-exit', '--test-concurrency=1', ...files], { cwd: root, env, stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(r.status === null ? 1 : r.status);
