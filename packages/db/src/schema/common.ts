import { randomUUID } from 'node:crypto';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** PK UUID impredecible, generada en la aplicación (nunca secuencial). */
export function idColumn() {
  return uuid('id').primaryKey().$defaultFn(() => randomUUID());
}

/** Instantes en UTC (timestamptz). created_at lo pone la BD; updated_at lo refresca la app. */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const createdOnly = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};
