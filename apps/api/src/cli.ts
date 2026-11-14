import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { pathToFileURL } from 'node:url';
import { createDb, createPool } from '@licitaclima/db';
import { createAdmin, listAdmins } from './lib/admin.js';

/**
 * CLI de bootstrap de administrador (Fase B).
 *   tsx src/cli.ts admin:create --email admin@licitaclima.es
 *   tsx src/cli.ts admin:list
 * La contraseña se pide por teclado (oculta) si no se pasa --password.
 * El secreto TOTP, la URL otpauth:// y los códigos de recuperación se
 * muestran UNA VEZ por consola: no quedan en logs ni en la BD en claro.
 * Sin contraseñas por defecto.
 */

function parseArgs(argv: string[]): { command: string; email?: string; password?: string } {
  const [command = '', ...rest] = argv;
  let email: string | undefined;
  let password: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--email') email = rest[i + 1];
    if (rest[i] === '--password') password = rest[i + 1];
  }
  return { command, email, password };
}

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => {
    const onData = (char: Buffer) => {
      const s = char.toString('utf8');
      if (s === '\n' || s === '\r') {
        process.stdin.off('data', onData);
        output.write('\n');
        rl.close();
        resolve(answer);
      } else if (char[0] === 3) {
        process.exit(130);
      } else if (char[0] === 127) {
        answer = answer.slice(0, -1);
      } else {
        answer += s;
      }
    };
    let answer = '';
    output.write(question);
    process.stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const { command, email, password } = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Falta DATABASE_URL.');
    process.exit(1);
  }
  const pool = createPool(connectionString);
  const db = createDb(pool);
  try {
    if (command === 'admin:create') {
      if (!email) {
        console.error('Uso: tsx src/cli.ts admin:create --email admin@licitaclima.es');
        process.exit(1);
      }
      let pw = password;
      if (!pw) pw = await promptHidden('Contraseña de administrador (mín. 12 caracteres): ');
      if (pw.length < 12) {
        console.error('La contraseña debe tener al menos 12 caracteres.');
        process.exit(1);
      }
      const created = await createAdmin(db, { email, password: pw });
      console.log(`\nAdministrador creado: ${created.user.email} (id ${created.user.id})`);
      console.log('\n--- CONFIGURA EL TOTP AHORA (se muestra una sola vez) ---');
      console.log(`Secreto TOTP: ${created.totpSecret}`);
      console.log(`URL otpauth (QR): ${created.otpauthUrl}`);
      console.log('Códigos de recuperación (un solo uso, guárdalos en lugar seguro):');
      for (const code of created.recoveryCodes) console.log(`  ${code}`);
      console.log('----------------------------------------------------------\n');
    } else if (command === 'admin:list') {
      const admins = await listAdmins(db);
      if (admins.length === 0) console.log('No hay administradores.');
      for (const a of admins) {
        console.log(`${a.email} | rol=${a.role} | totp=${a.totpEnabled ? 'sí' : 'no'} | creado=${a.createdAt.toISOString()}`);
      }
    } else {
      console.error('Comandos: admin:create --email X | admin:list');
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  });
}
