import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.js',
  dbCredentials: { url: process.env.DATABASE_URL },
});
