import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { desc, inArray } from 'drizzle-orm';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { parseWorkbook } from './excel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.csv') cb(null, true);
    else cb(new Error('Only .xlsx and .csv files are supported.'));
  },
});

const isCsvFile = (file) => path.extname(file.originalname).toLowerCase() === '.csv';

// Which of these (lowercase) emails are already saved in the database?
async function findExistingEmails(emails) {
  const existing = new Set();
  for (let i = 0; i < emails.length; i += 1000) {
    const found = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.email, emails.slice(i, i + 1000)));
    found.forEach((r) => existing.add(r.email.toLowerCase()));
  }
  return existing;
}

// Parse the file, then reject rows whose email is already in the database.
// Rows that are invalid or duplicated inside the file are rejected by parseWorkbook.
async function processFile(file) {
  const { errors, entries } = await parseWorkbook(file.buffer, isCsvFile(file));
  const existing = await findExistingEmails(entries.map((e) => e.data.email.toLowerCase()));

  const rows = [];
  for (const { row, data } of entries) {
    if (existing.has(data.email.toLowerCase())) {
      errors.push({ row, problems: ['email: already exists in the database'], data });
    } else {
      rows.push(data);
    }
  }

  errors.sort((a, b) => a.row - b.row);
  return { rows, errors };
}

// Build the rejected-rows Excel file (returns a Buffer)
async function buildRejectedWorkbook(errors) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Rejected Rows');

  sheet.columns = [
    { header: 'Row', key: 'row', width: 8 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Age', key: 'age', width: 10 },
    { header: 'Email', key: 'email', width: 35 },
    { header: 'Reason', key: 'reason', width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  sheet.addRows(
    errors.map((e) => ({
      row: e.row, // row number in the original file
      name: e.data.name,
      age: e.data.age,
      email: e.data.email,
      reason: e.problems.join('; '),
    })),
  );

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

app.use(express.static(path.join(__dirname, '..', 'public')));

// Upload a file: the file is checked ONCE, valid rows are saved, and if any rows
// were rejected the response is an Excel file listing them with the reasons.
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose an .xlsx or .csv file first.' });

    const { rows, errors } = await processFile(req.file);

    if (rows.length === 0 && errors.length === 0) {
      return res.status(422).json({ error: 'No data rows found in the file.' });
    }

    // Build the rejected file before saving, so a failure here saves nothing
    const rejectedFile = errors.length > 0 ? await buildRejectedWorkbook(errors) : null;

    // Save all valid rows in one transaction (chunks of 500)
    if (rows.length > 0) {
      await db.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i += 500) {
          await tx.insert(users).values(rows.slice(i, i + 500));
        }
      });
    }

    res.setHeader('X-Inserted-Rows', String(rows.length));
    res.setHeader('X-Rejected-Rows', String(errors.length));

    if (!rejectedFile) {
      return res.json({ inserted: rows.length, rejected: 0 });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="rejected_rows.xlsx"');
    res.send(rejectedFile);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// List saved rows
app.get('/api/users', async (_req, res) => {
  const data = await db.select().from(users).orderBy(desc(users.id)).limit(500);
  res.json(data);
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Running on http://localhost:${port}`));