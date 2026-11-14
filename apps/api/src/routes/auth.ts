import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '@licitaclima/db';
import { badRequest, unavailable } from '../lib/errors.js';
import { hashIp } from '../lib/crypto.js';
import {
  SESSION_COOKIE,
  revokeSession,
  sessionCookieOptions,
} from '../lib/sessions.js';
import { consumeMagicLink, requestMagicLink, verifyMagicLink } from '../lib/auth.js';
import { loginAdmin, reauthAdmin } from '../lib/admin.js';
import { authenticate, requireAdmin } from '../lib/tenant.js';
import { checkCsrf } from '../lib/csrf.js';
import {
  adminLoginSchema,
  adminReauthSchema,
  consumeLinkSchema,
  requestLinkSchema,
  verifyLinkSchema,
} from '../lib/schemas.js';

export interface RouteOptions {
  db?: Db;
}

export function requireDb(db: Db | undefined): Db {
  if (!db) throw unavailable();
  return db;
}

function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw badRequest(first?.message ?? 'Petición no válida.');
  }
  return result.data;
}

export const authRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.post('/auth/request-link', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    checkCsrf(request);
    const body = parseBody(requestLinkSchema, request.body);
    await requestMagicLink(requireDb(db), {
      email: body.email,
      ipHash: hashIp(request.ip),
    });
    // Respuesta SIEMPRE idéntica: no revela si el correo existe.
    return reply.code(200).send({
      ok: true,
      message: 'Si el correo existe, recibirás un enlace de acceso válido 15 minutos.',
    });
  });

  app.get('/auth/verify-link', async (request, reply) => {
    const query = parseBody(verifyLinkSchema, request.query);
    const result = await verifyMagicLink(requireDb(db), query.token);
    return reply.send(result);
  });

  app.post('/auth/consume-link', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    checkCsrf(request);
    const body = parseBody(consumeLinkSchema, request.body);
    const { user, organization, membershipRole, sessionToken } = await consumeMagicLink(requireDb(db), {
      token: body.token,
      userAgent: request.headers['user-agent'] ?? null,
      ipHash: hashIp(request.ip),
    });
    reply.setCookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    return reply.code(200).send({
      user: { id: user.id, email: user.email, displayName: user.displayName },
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
      membershipRole,
    });
  });

  app.post('/auth/logout', async (request, reply) => {
    checkCsrf(request);
    const token = request.cookies?.[SESSION_COOKIE];
    if (token && db) await revokeSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

  app.post('/auth/admin/login', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    checkCsrf(request);
    const body = parseBody(adminLoginSchema, request.body);
    const { user, sessionToken } = await loginAdmin(requireDb(db), {
      email: body.email,
      password: body.password,
      totpCode: body.totpCode,
      userAgent: request.headers['user-agent'] ?? null,
      ipHash: hashIp(request.ip),
    });
    reply.setCookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    return reply.code(200).send({ user: { id: user.id, email: user.email, role: user.role } });
  });

  app.post('/auth/admin/reauth', async (request, reply) => {
    checkCsrf(request);
    const ctx = requireAdmin(await authenticate(request, requireDb(db)));
    const body = parseBody(adminReauthSchema, request.body);
    await reauthAdmin(requireDb(db), ctx.session.id, {
      userId: ctx.user.id,
      password: body.password,
      totpCode: body.totpCode,
    });
    return reply.send({ ok: true });
  });
};
