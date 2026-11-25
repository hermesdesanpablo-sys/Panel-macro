// Middleware de Vercel (corre antes de la caché, en todas las rutas): exige sesión para ver el panel y para las APIs.
// /login (GET: formulario, POST: valida) y /logout son las únicas rutas abiertas. Ver api/_lib/auth.js.
import { checkLogin, makeSession, readSession, getCookie, users, COOKIE, USER_COOKIE, MAX_AGE } from './api/_lib/auth.js';

export const config = { matcher: '/:path*' };

const cookie = (name, value, { maxAge = MAX_AGE, httpOnly = true } = {}) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}`;
const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function loginPage({ next = '/', error = '', user = '' } = {}) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Macro Monitor – Ingresar</title><meta name="robots" content="noindex">
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f2f2f0;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
form{width:100%;max-width:340px;background:#111;border:1px solid #242424;border-radius:12px;padding:28px}h1{font-size:19px;margin:0 0 4px}p{color:#85847e;margin:0 0 22px;font-size:13px}
label{display:block;font-size:12.5px;color:#b9b8b2;margin:14px 0 6px}input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#f2f2f0;font:inherit}
input:focus{outline:2px solid #3987e5;outline-offset:1px}button{margin-top:22px;width:100%;padding:11px;border:0;border-radius:8px;background:#3987e5;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.err{margin-top:14px;color:#f0616d;font-size:13px}</style></head><body>
<form method="post" action="/login"><h1>Macro Monitor</h1><p>Acceso restringido</p>
<input type="hidden" name="next" value="${esc(next)}">
<label for="u">Usuario</label><input id="u" name="user" autocomplete="username" autocapitalize="characters" required value="${esc(user)}" ${user ? '' : 'autofocus'}>
<label for="p">Contraseña</label><input id="p" name="password" type="password" autocomplete="current-password" required ${user ? 'autofocus' : ''}>
<button type="submit">Ingresar</button>${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}</form></body></html>`;
}
const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export default async function middleware(request) {
  const url = new URL(request.url);
  const env = process.env;
  if (!Object.keys(users(env)).length) {
    // Sin usuarios configurados el panel queda cerrado: nunca abierto por un error de configuración.
    return html('<p style="font-family:system-ui;padding:24px">Acceso no configurado: faltan las variables AUTH_PASS_&lt;USUARIO&gt; en Vercel.</p>', 503);
  }
  if (url.pathname === '/login') {
    if (request.method === 'POST') {
      const f = await request.formData();
      const user = await checkLogin(f.get('user'), f.get('password'), env);
      const next = safeNext(f.get('next'));
      if (!user) {
        await new Promise((r) => setTimeout(r, 700)); // frena intentos repetidos
        return html(loginPage({ next, error: 'Usuario o contraseña incorrectos.', user: String(f.get('user') || '') }), 401);
      }
      const h = new Headers({ location: next, 'cache-control': 'no-store' });
      h.append('set-cookie', cookie(COOKIE, await makeSession(user, env)));
      h.append('set-cookie', cookie(USER_COOKIE, user, { httpOnly: false }));
      return new Response(null, { status: 303, headers: h });
    }
    return html(loginPage({ next: safeNext(url.searchParams.get('next')) }));
  }
  if (url.pathname === '/logout') {
    const h = new Headers({ location: '/login', 'cache-control': 'no-store' });
    h.append('set-cookie', cookie(COOKIE, '', { maxAge: 0 }));
    h.append('set-cookie', cookie(USER_COOKIE, '', { maxAge: 0, httpOnly: false }));
    return new Response(null, { status: 303, headers: h });
  }
  const user = await readSession(getCookie(request, COOKIE), env);
  if (user) return undefined; // sesión válida: sigue a la página o a la API
  // Verificaciones automáticas (p. ej. Claude Code): mismo usuario y contraseña en un encabezado Authorization: Basic, solo por HTTPS.
  // No crea sesión ni cookie; el navegador no lo usa porque nunca se pide (no se envía WWW-Authenticate).
  const basic = /^Basic\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  if (basic) {
    let u = '', p = '';
    try { [u, ...p] = atob(basic).split(':'); p = p.join(':'); } catch { /* encabezado mal formado */ }
    if (await checkLogin(u, p, env)) return undefined;
    await new Promise((r) => setTimeout(r, 700));
  }
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Sesión vencida o inexistente' }), { status: 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  return Response.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, url), 302);
}
