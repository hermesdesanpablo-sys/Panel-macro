// Genera el valor de AUTH_PASS_<USUARIO> como hash (opcional: también se puede cargar la contraseña tal cual, marcada "Sensitive").
// Uso: node scripts/hash-password.mjs <contraseña>
import { hashPassword } from '../api/_lib/auth.js';
const p = process.argv[2];
if (!p) { console.error('Uso: node scripts/hash-password.mjs <contraseña>'); process.exit(1); }
console.log(await hashPassword(p));
