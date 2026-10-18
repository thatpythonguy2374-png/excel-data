
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';

const pool = mysql.createPool(process.env.DATABASE_URL);

export const db = drizzle(pool, {
  mode: 'default',
});
