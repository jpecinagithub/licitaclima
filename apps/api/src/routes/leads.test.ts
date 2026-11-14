// Tests de la API de lectura: leads públicos (sin sesión, con rate limit).
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { consentEvents, leads } from '@licitaclima/db';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';

process.env.SESSION_SECRET ??= 'test-session-secret-solo-test-000000000000';

let t: TestDb;
let app: ReturnType<typeof buildServer>;

beforeAll(async () => {
  t = await createTestDb();
  app = buildServer({ db: t.db });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await t.cleanup();
});

describe('POST /leads', () => {
  it('crea el lead y registra el consentimiento solo si se marca', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/leads',
      payload: {
        email: 'lead-a@example.es',
        actividad: 'Mantenimiento de climatización',
        provincia: 'Madrid',
        consentimientoMarketing: true,
      },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { ok: boolean }).ok).toBe(true);
    const [lead] = await t.db.select().from(leads).where(eq(leads.email, 'lead-a@example.es')).limit(1);
    expect(lead?.activity).toBe('Mantenimiento de climatización');
    expect(lead?.province).toBe('Madrid');
    const consents = await t.db
      .select()
      .from(consentEvents)
      .where(eq(consentEvents.email, 'lead-a@example.es'));
    expect(consents.length).toBe(1);
    expect(consents[0]?.purpose).toBe('marketing');
    expect(consents[0]?.granted).toBe(true);
    expect(consents[0]?.textVersion).toBe('marketing-v1');
  });

  it('reenvío sin consentimiento: actualiza el lead sin duplicar ni consentir', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/leads',
      payload: {
        email: 'lead-a@example.es',
        actividad: 'Instalación de aire acondicionado',
        provincia: 'Toledo',
        consentimientoMarketing: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const rows = await t.db.select().from(leads).where(eq(leads.email, 'lead-a@example.es'));
    expect(rows.length).toBe(1);
    expect(rows[0]?.province).toBe('Toledo');
    const consents = await t.db
      .select()
      .from(consentEvents)
      .where(eq(consentEvents.email, 'lead-a@example.es'));
    expect(consents.length).toBe(1);
  });

  it('sin consentimiento no registra nada en consent_events', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/leads',
      payload: {
        email: 'lead-b@example.es',
        actividad: 'Climatización',
        provincia: 'Segovia',
        consentimientoMarketing: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const consents = await t.db
      .select()
      .from(consentEvents)
      .where(eq(consentEvents.email, 'lead-b@example.es'));
    expect(consents.length).toBe(0);
  });

  it('email no válido o campos ausentes → 400', async () => {
    const badEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/leads',
      payload: { email: 'no-es-email', actividad: 'Clima', provincia: 'Madrid', consentimientoMarketing: false },
    });
    expect(badEmail.statusCode).toBe(400);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/leads',
      payload: { email: 'lead-c@example.es', actividad: 'Clima', consentimientoMarketing: false },
    });
    expect(missing.statusCode).toBe(400);
  });
});
