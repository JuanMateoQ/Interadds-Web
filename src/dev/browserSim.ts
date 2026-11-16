// Simula en Node lo que hace el NAVEGADOR (WebCrypto): genera el par de claves del usuario, pide su
// certificado y firma. Lo usan las semillas y las pruebas automatizadas; la app real usa src/lib/client/webcrypto.js.
import { webcrypto } from 'crypto';
import * as certificates from '../modules/signing/certificates';
import * as contractSigning from '../modules/signing/contractSigning';
import * as approval from '../modules/payments/approval';
import { EC_ALG, SIGN_ALG } from '../modules/signing/ca';

const subtle = webcrypto.subtle;
const b64 = (buf) => Buffer.from(buf).toString('base64');

class BrowserSim {
  user: any;
  password: any;
  keys: any;
  serial: any;
  /** @param user { id, name, email, role } */
  constructor(user, password) {
    this.user = user;
    this.password = password;
    this.keys = null;
    this.serial = null;
  }

  async sign(text) {
    return b64(await subtle.sign(SIGN_ALG, this.keys.privateKey, Buffer.from(text, 'utf8')));
  }

  /** Genera el par ECDSA P-256 (clave privada no exportable) y obtiene el certificado de la CA. */
  async ensureCertificate() {
    if (this.serial) return this.serial;
    this.keys = await subtle.generateKey(EC_ALG, false, ['sign', 'verify']);
    const publicKey = b64(await subtle.exportKey('spki', this.keys.publicKey));
    const ch = await certificates.createChallenge(this.user);
    const popSignature = await this.sign(certificates.certRequestPayload({ userId: this.user.id, nonce: ch.nonce, publicKeySpki: publicKey }));
    const cert = await certificates.issueCertificate(this.user, { publicKey, challenge: ch.nonce, popSignature });
    this.serial = cert.serial;
    return cert;
  }

  async signContract(contractId, password = this.password) {
    await this.ensureCertificate();
    const prep = await contractSigning.prepareContractSignature({ user: this.user, contractId, password });
    const signature = await this.sign(prep.payload);
    return contractSigning.signContract({ user: this.user, contractId, nonce: prep.nonce, signature, certificateSerial: this.serial });
  }

  async approveContent(contractId, password = this.password) {
    await this.ensureCertificate();
    const prep = await approval.prepareApproval({ user: this.user, contractId, password });
    const signature = await this.sign(prep.payload);
    return approval.approveContent({ user: this.user, contractId, nonce: prep.nonce, signature, certificateSerial: this.serial });
  }
}

export { BrowserSim };
