import { mysqlTable, serial, varchar, int } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  age: int('age').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
});
