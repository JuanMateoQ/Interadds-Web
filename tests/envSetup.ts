// Valores por defecto de las pruebas; debe importarse PRIMERO (los imports de ES se ejecutan antes que el resto del código).
(process.env as any).NODE_ENV = process.env.NODE_ENV || 'test';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '4';
process.env.PAYMENT_GATEWAY = process.env.PAYMENT_GATEWAY || 'fake';
