// Servidor Node PROPIO (RNF-10): una sola aplicación que sirve las vistas y rutas de Next.js
// y aloja el servidor WebSocket (Socket.IO) del chat dentro del mismo proceso.
import './lib/env';
import http from 'http';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOST || 'localhost';

const server = http.createServer();
const app = next({ dev, hostname, port, httpServer: server });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    server.on('request', (req, res) => handle(req, res));
    server.listen(port, () => {
      console.log(`> Interadds listo en http://${hostname}:${port} (${dev ? 'desarrollo' : 'producción'})`);
      console.log(`> Pasarela de pago: ${process.env.PAYMENT_GATEWAY || 'paypal'}`);
    });
  })
  .catch((err) => {
    console.error('No se pudo iniciar el servidor:', err);
    process.exit(1);
  });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n${sig} recibido, cerrando...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
