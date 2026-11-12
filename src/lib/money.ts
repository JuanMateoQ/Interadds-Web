// Los montos se guardan siempre en centavos enteros (sin errores de coma flotante).
function toCents(usd) {
  return Math.round(Number(usd) * 100);
}
function fromCents(cents) {
  return Number(cents) / 100;
}
/** "50.00" - formato exacto que exige PayPal Orders v2. */
function toDecimalString(cents) {
  return (Number(cents) / 100).toFixed(2);
}
function formatUsd(cents) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(cents) / 100);
}
/** Reparto 50/50 sin perder centavos: el anticipo es la mitad hacia abajo y el saldo el resto. */
function splitFiftyFifty(totalCents) {
  const anticipo = Math.floor(totalCents / 2);
  return { anticipoCents: anticipo, saldoCents: totalCents - anticipo };
}

export { toCents, fromCents, toDecimalString, formatUsd, splitFiftyFifty };
