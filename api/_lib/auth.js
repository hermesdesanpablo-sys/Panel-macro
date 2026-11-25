// Acceso con usuario y contraseña (sin servicios externos). Lo usa middleware.js, que corre en Vercel antes de la caché.
// Usuarios: una variable de entorno por usuario, AUTH_PASS_<USUARIO> (p. ej. AUTH_PASS_HDSP). El valor puede ser la contraseña
// (cargarla como "Sensitive" en Vercel) o un hash "pbkdf2$<iteraciones>$<sal b64url>$<hash b64url>" generado con scripts/hash-password.mjs.
// Sesión: cookie firmada con HMAC-SHA256 (usuario.vencimiento.firma), HttpOnly, 30 días. La clave de firma es AUTH_SECRET si existe;
// si no, se deriva de las contraseñas: al cambiar una contraseña se cierran todas las sesiones.
// Solo Web Crypto: funciona en el runtime Edge y en Node.
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const COOKIE = 'pm_s';
export const USER_COOKIE = 'pm_u';
export const MAX_AGE = 30 * 24 * 3600;

/** { HDSP: '…', JV: '…' } desde las variables AUTH_PASS_*. */
export function users(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    const m = /^AUTH_PASS_([A-Z0-9_]+)$/.exec(k);
    if (m && v) out[m[1]] = v;
  }
  return out;
}

async function hmac(keyBytes, msg) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
/** Comparación en tiempo constante (sobre HMAC de ambos lados, para no filtrar el largo). */
async function safeEqual(a, b) {
  const k = crypto.getRandomValues(new Uint8Array(32));
  const [x, y] = await Promise.all([hmac(k, a), hmac(k, b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
export async function hashPassword(password, iterations = 100000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64u(salt)}$${b64u(await pbkdf2(password, salt, iterations))}`;
}

/** Usuario canónico si usuario y contraseña son correctos; null si no. El usuario no distingue mayúsculas. */
export async function checkLogin(user, password, env = process.env) {
  const all = users(env);
  const name = Object.keys(all).find((u) => u === String(user || '').trim().toUpperCase());
  const stored = name ? all[name] : 'pbkdf2$1$AA$AA'; // usuario inexistente: se compara igual para no revelar cuáles existen
  let ok;
  if (stored.startsWith('pbkdf2$')) {
    const [, it, salt, hash] = stored.split('$');
    ok = await safeEqual(b64u(await pbkdf2(String(password || ''), unb64u(salt), Number(it))), hash);
  } else {
    ok = await safeEqual(String(password || ''), stored);
  }
  return ok && name ? name : null;
}

async function signingKey(env = process.env) {
  const base = env.AUTH_SECRET || Object.entries(users(env)).sort().map(([u, p]) => `${u}=${p}`).join('\n');
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`panel-macro-sesion\n${base}`)));
}
export async function makeSession(user, env = process.env, now = Date.now()) {
  const exp = Math.floor(now / 1000) + MAX_AGE;
  const body = `${user}.${exp}`;
  return `${body}.${b64u(await hmac(await signingKey(env), body))}`;
}
/** Usuario de una cookie de sesión válida, o null (firma mala, vencida o usuario dado de baja). */
export async function readSession(value, env = process.env, now = Date.now()) {
  const [user, exp, sig] = String(value || '').split('.');
  if (!user || !exp || !sig || Number(exp) * 1000 < now || !users(env)[user]) return null;
  const good = b64u(await hmac(await signingKey(env), `${user}.${exp}`));
  return (await safeEqual(sig, good)) ? user : null;
}
export const getCookie = (req, name) => (req.headers.get('cookie') || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.slice(1).join('=') || null;
