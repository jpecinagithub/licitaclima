// LicitaClima — soporte (Fase D, prompt §11).
// Ticket vinculado a la organización, con conversación (tabla conversations +
// messages). El agente contesta sobre uso, cuenta y documentos autorizados.
// REGLA DURA (documentada aquí y en el panel admin): el agente NUNCA promete
// compensaciones ni modifica datos sensibles (pagos, identidad, seguridad)
// a partir de texto libre. Esas peticiones se resuelven en sesión
// autenticada o se escalan; una promesa en texto libre no tiene efecto.
import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { auditLogs, conversations, messages, supportTickets } from '@licitaclima/db';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { authenticate, requireOrg } from '../lib/tenant.js';
import { checkCsrf } from '../lib/csrf.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import {
  supportMessageSchema,
  supportTicketSchema,
  supportTicketStatusSchema,
} from '../lib/schemas.js';

function parseBody<T>(schema: { safeParse: (b: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message?: string }> } } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const r = result as { success: false; error: { issues: Array<{ message?: string }> } };
    throw badRequest(r.error.issues[0]?.message ?? 'Petición no válida.');
  }
  return (result as { success: true; data: T }).data;
}

function parsePagination(request: { query?: unknown }): { limit: number; offset: number } {
  const q = (request.query ?? {}) as Record<string, unknown>;
  const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20) || 20));
  const offset = Math.max(0, Number(q.offset ?? 0) || 0);
  return { limit, offset };
}

async function getOwnTicket(db: Db, organizationId: string, ticketId: string) {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.organizationId, organizationId)))
    .limit(1);
  // 404 genérico también para tickets de otra organización (no se confirma existencia).
  if (!ticket) throw notFound('Ticket no encontrado.');
  return ticket;
}

function ticketToJson(ticket: typeof supportTickets.$inferSelect) {
  return {
    id: ticket.id,
    organizationId: ticket.organizationId,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export const supportRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.post('/support/tickets', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const body = parseBody(supportTicketSchema, request.body);
    const d = requireDb(db);
    const ticket = await d.transaction(async (tx) => {
      const [conversation] = await tx
        .insert(conversations)
        .values({ organizationId, title: body.subject })
        .returning();
      await tx.insert(messages).values({
        conversationId: conversation.id,
        organizationId,
        role: 'user',
        content: body.message,
      });
      const [created] = await tx
        .insert(supportTickets)
        .values({
          organizationId,
          userId: ctx.user.id,
          conversationId: conversation.id,
          subject: body.subject,
          status: 'open',
          priority: body.priority,
        })
        .returning();
      await tx.insert(auditLogs).values({
        organizationId,
        actorUserId: ctx.user.id,
        actorType: 'user',
        action: 'support_ticket.created',
        objectType: 'support_ticket',
        objectId: created.id,
        details: { subject: body.subject, priority: body.priority },
      });
      return created;
    });
    return reply.code(201).send(ticketToJson(ticket));
  });

  app.get('/support/tickets', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const { limit, offset } = parsePagination(request);
    const rows = await requireDb(db)
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.organizationId, organizationId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(limit)
      .offset(offset);
    return reply.send({ tickets: rows.map(ticketToJson), limit, offset });
  });

  app.get('/support/tickets/:id', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const ticket = await getOwnTicket(d, organizationId, (request.params as { id: string }).id);
    const msgs = ticket.conversationId
      ? await d
          .select()
          .from(messages)
          .where(eq(messages.conversationId, ticket.conversationId))
          .orderBy(messages.createdAt)
      : [];
    return reply.send({
      ...ticketToJson(ticket),
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  });

  app.post('/support/tickets/:id/messages', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const body = parseBody(supportMessageSchema, request.body);
    const d = requireDb(db);
    const ticket = await getOwnTicket(d, organizationId, (request.params as { id: string }).id);
    if (ticket.status === 'closed') {
      throw conflict('El ticket está cerrado. Abre uno nuevo si necesitas ayuda.', 'ticket_closed');
    }
    if (!ticket.conversationId) throw badRequest('El ticket no tiene conversación asociada.');
    const [msg] = await d
      .insert(messages)
      .values({
        conversationId: ticket.conversationId,
        organizationId,
        role: 'user',
        content: body.message,
      })
      .returning();
    if (ticket.status === 'resolved') {
      await d
        .update(supportTickets)
        .set({ status: 'open', updatedAt: new Date() })
        .where(eq(supportTickets.id, ticket.id));
    }
    return reply.code(201).send({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    });
  });

  app.patch('/support/tickets/:id', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const body = parseBody(supportTicketStatusSchema, request.body);
    // El cliente solo puede resolver o cerrar su propio ticket.
    if (body.status !== 'resolved' && body.status !== 'closed') {
      throw badRequest('Solo puedes resolver o cerrar tu ticket.');
    }
    const d = requireDb(db);
    const ticket = await getOwnTicket(d, organizationId, (request.params as { id: string }).id);
    const [updated] = await d
      .update(supportTickets)
      .set({ status: body.status, updatedAt: new Date() })
      .where(eq(supportTickets.id, ticket.id))
      .returning();
    return reply.send(ticketToJson(updated));
  });
};
