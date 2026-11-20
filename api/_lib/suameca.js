// Suameca (BanRep, estadísticas económicas): API REST pública, sin clave. Series por id, con toda la historia:
//   https://suameca.banrep.gov.co/estadisticas-economicas-back/rest/estadisticaEconomicaRestService/consultaInformacionSerie?idSerie=<id>
// Respuesta: [{ nombre, fechaFinal, fechaUltimoCargue, data: [[epoch ms (medianoche de Bogotá), valor], ...] }].
//
// El servidor no envía el certificado intermedio (GeoTrust EV RSA CA G2) y Node no lo descarga solo: fetch falla con
// "unable to verify the first certificate". Se agrega ese intermedio público de DigiCert (vence 2-jul-2030; se baja de
// http://cacerts.digicert.com/GeoTrustEVRSACAG2.crt) a las raíces de Node: la cadena se verifica igual, completa.
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import { getText, clean } from './util.js';

export const SUAMECA_BASE = 'https://suameca.banrep.gov.co/estadisticas-economicas-back/rest/estadisticaEconomicaRestService';
export const SUAMECA_PAGE = (id, slug = '') => `https://suameca.banrep.gov.co/estadisticas-economicas/informacionSerie/${id}/${slug}`;

const GEOTRUST_EV_RSA_CA_G2 = `-----BEGIN CERTIFICATE-----
MIIFPDCCBCSgAwIBAgIQDWASYsinchpuqwNh5WGVgDANBgkqhkiG9w0BAQsFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH
MjAeFw0yMDA3MDIxMjQyNTdaFw0zMDA3MDIxMjQyNTdaMEQxCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxHjAcBgNVBAMTFUdlb1RydXN0IEVWIFJT
QSBDQSBHMjCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANDSvFMMGIOI
D2N+rpyaGTPfyItp3atCyimRJCPtAakU984EB19Zugrb82ui0iy0zLKMDrOuN+Ku
H6jF4F4ZCoHjN7tFdMtSsCUAbrpFVO/5BLY+VTIg7YUN5LwRHUb2QVSGwKyIeYS+
SqPV8mzTMkG9GnWjG1IQT0F1+Xu7+uAGRFVnIdYCSBgl7iG4qOWZjcPKnW+3OJRO
dZtwGE39E7WoasoW8Nvpu5FFp2WIsvY6B/0whr3w+xKeBYb2WNKI1ZXvk4y+AmUa
BdRTY0HPBZ4+6Ipcq2Rl+QLQXQuGXH95YujYNYpbnV7ASU5/dVmqVPY0LHnp2sNK
IN65/n+DbcsCAwEAAaOCAgswggIHMB0GA1UdDgQWBBQo0s/uCYR13bWytb881aDG
c4hdHzAfBgNVHSMEGDAWgBROIlQgGJXm427mD/r6uRLtBhePOTAOBgNVHQ8BAf8E
BAMCAYYwHQYDVR0lBBYwFAYIKwYBBQUHAwEGCCsGAQUFBwMCMBIGA1UdEwEB/wQI
MAYBAf8CAQAwNAYIKwYBBQUHAQEEKDAmMCQGCCsGAQUFBzABhhhodHRwOi8vb2Nz
cC5kaWdpY2VydC5jb20wewYDVR0fBHQwcjA3oDWgM4YxaHR0cDovL2NybDMuZGln
aWNlcnQuY29tL0RpZ2lDZXJ0R2xvYmFsUm9vdEcyLmNybDA3oDWgM4YxaHR0cDov
L2NybDQuZGlnaWNlcnQuY29tL0RpZ2lDZXJ0R2xvYmFsUm9vdEcyLmNybDCBzgYD
VR0gBIHGMIHDMIHABgRVHSAAMIG3MCgGCCsGAQUFBwIBFhxodHRwczovL3d3dy5k
aWdpY2VydC5jb20vQ1BTMIGKBggrBgEFBQcCAjB+DHxBbnkgdXNlIG9mIHRoaXMg
Q2VydGlmaWNhdGUgY29uc3RpdHV0ZXMgYWNjZXB0YW5jZSBvZiB0aGUgUmVseWlu
ZyBQYXJ0eSBBZ3JlZW1lbnQgbG9jYXRlZCBhdCBodHRwczovL3d3dy5kaWdpY2Vy
dC5jb20vcnBhLXVhMA0GCSqGSIb3DQEBCwUAA4IBAQBVbQs8KD6qRnOf/dtOHNAy
ieoRcA1Zk3lGMLwqNfuLpTb9gDQFpvxGN/3X7i0mAEtRhN/r9fDv8oiVLn6gfpm0
UUN47vFJCzf5dqkV/N7LkMTqlhDA0Ve/GBJ3A2E5yFT7TgAGN4wJ9cCZrKbqKHVU
RatwJ+T58jmhbvtEM7t2ucB7u+Dmu4KoOTEx8LR8+qn8OyLh1VLq75vzDTsnhTN5
3AgPdMVFk6F8sjT2P2xbvAb0kAlyAtldAtpGvBzXhacmRs7rTqz/oTDwYZLkrm+q
EltdmGwUOWvFPjwucH6tS+gQgiUYiNJqijzI1jr8TZ01VGOSTW7rRUKgkN5WJqDA
-----END CERTIFICATE-----`;
let caList;
// Con un CA propio, Node deja de leer NODE_EXTRA_CA_CERTS: se suma a mano (solo existe en entornos con proxy, no en Vercel).
const extra = () => { try { return process.env.NODE_EXTRA_CA_CERTS ? [fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS, 'utf8')] : []; } catch { return []; } };
const ca = () => (caList ||= [...tls.rootCertificates, GEOTRUST_EV_RSA_CA_G2, ...extra()]);

function getWithChain(url, timeout) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { ca: ca(), headers: { 'User-Agent': 'Mozilla/5.0 (macro-dashboard)' }, timeout }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return reject(new Error(`HTTP ${r.statusCode} en suameca.banrep.gov.co`)); }
      let s = '';
      r.setEncoding('utf8').on('data', (c) => { s += c; }).on('end', () => resolve(s));
    });
    req.on('timeout', () => req.destroy(new Error('Suameca: tiempo agotado')));
    req.on('error', reject);
  });
}

/** Serie de Suameca → { name, series: [{d, v}], lastLoad }. Primero fetch (por si el servidor corrige la cadena); si falla, https con el intermedio. */
export async function suameca(id, { timeout = 20000 } = {}) {
  const url = `${SUAMECA_BASE}/consultaInformacionSerie?idSerie=${id}`;
  let txt;
  try { txt = await getText(url, { timeout }); } catch { txt = await getWithChain(url, timeout); }
  const s = JSON.parse(txt)?.[0];
  if (!s?.data?.length) throw new Error(`Suameca: serie ${id} vacía`);
  // Las fechas vienen como medianoche de Bogotá (UTC−5): se suman 5 h antes de tomar el día.
  const series = clean(s.data.map(([t, v]) => ({ d: new Date(t + 5 * 3600e3).toISOString().slice(0, 10), v })));
  return { name: s.nombre, series, lastLoad: s.fechaUltimoCargue || null };
}
