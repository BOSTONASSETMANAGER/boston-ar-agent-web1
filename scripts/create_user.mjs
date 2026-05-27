/**
 * Crea (o actualiza) un usuario en Supabase Auth + perfil con rol.
 *
 * Uso:
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<key>";
 *   node scripts/create_user.mjs --email=anahi@bostonam.com --password='...' --role=autor
 *
 * Idempotente: si el email ya existe, actualiza la password y el rol.
 */
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split('=');
      return [k, rest.join('=')];
    }),
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'https://ewhucijcniibgxqwbhte.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = args.email;
const PASSWORD = args.password;
const ROLE = args.role || 'autor';

if (!SERVICE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en env.');
  process.exit(1);
}
if (!EMAIL || !PASSWORD) {
  console.error('Faltan --email y/o --password.');
  process.exit(1);
}
if (!['admin', 'autor'].includes(ROLE)) {
  console.error(`Rol inválido: ${ROLE}. Usar 'admin' o 'autor'.`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  // Paginado por las dudas. Para una org chica un page basta.
  let page = 1;
  while (page <= 5) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 1000) return null;
    page++;
  }
  return null;
}

async function main() {
  console.log(`Buscando usuario existente para ${EMAIL}...`);
  const existing = await findUserByEmail(EMAIL);

  let userId;
  if (existing) {
    console.log(`  ya existe (id=${existing.id}). Actualizando password + email_confirm.`);
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = existing.id;
  } else {
    console.log('  no existe. Creando en auth.users con email_confirm=true.');
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
  }

  console.log(`Upserting profiles row (id=${userId}, role=${ROLE})...`);
  const { error: pErr } = await supabase
    .from('profiles')
    .upsert(
      { id: userId, role: ROLE, email: EMAIL.toLowerCase() },
      { onConflict: 'id' },
    );
  if (pErr) {
    // Fallback si la tabla no tiene columna 'email' (sólo id + role)
    if (/column .* email .* does not exist/i.test(pErr.message)) {
      const { error: pErr2 } = await supabase
        .from('profiles')
        .upsert({ id: userId, role: ROLE }, { onConflict: 'id' });
      if (pErr2) throw pErr2;
    } else {
      throw pErr;
    }
  }

  console.log(`\nOK — usuario ${EMAIL} listo con rol ${ROLE}.`);
}

main().catch((e) => { console.error('ERROR:', e.message || e); process.exit(1); });
