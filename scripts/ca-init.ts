// Crea la CA de dos niveles de Interadds (RS-10, RS-11, RS-46).  Uso:  npm run ca:init [-- --force]
import 'reflect-metadata';
import { initCA } from '../src/modules/signing/ca';

(async () => {
  const force = process.argv.includes('--force');
  try {
    const r = await initCA({ force });
    console.log('CA de Interadds creada.');
    console.log('  Certificado raíz      :', r.files.rootCert);
    console.log('  Certificado emisor    :', r.files.issuingCert);
    console.log('  Clave privada emisora :', r.files.issuingKey, '(solo el servidor; nunca al repositorio)');
    console.log('  Clave privada RAÍZ    :', r.files.rootKey);
    console.log('\nIMPORTANTE: mueve la clave de la CA raíz a un medio SIN CONEXIÓN (USB) y bórrala del servidor.');
    console.log('La raíz solo se necesita para firmar una nueva CA emisora; el sistema en ejecución no la usa.');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
