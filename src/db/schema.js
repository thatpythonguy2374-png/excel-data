import { timestamp } from 'drizzle-orm/gel-core';
import { mysqlTable, serial, varchar, int } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  age: int('age').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  uploadedFileName: varchar("uploaded_file_name", {
  length: 255,
}).notNull(),
});
