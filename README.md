# Excel upload (Node.js + Drizzle + MySQL)

Upload an .xlsx or .csv file with columns Name, Age, Email; rows are saved to the `users` table.

1. Create the database: `CREATE DATABASE excel_import;`
2. `npm install`
3. `cp .env.example .env` and set DATABASE_URL
4. `npm run db:push`
5. `npm run dev` then open http://localhost:3000
