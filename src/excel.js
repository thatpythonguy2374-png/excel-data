import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { Player } from "./db/validation.js";

// Excel header (lowercased, trimmed) -> database field.
const HEADER_MAP = {
  name: "name",
  "full name": "name",
  age: "age",
  email: "email",
  "email address": "email",
};

const REQUIRED = ["name", "age", "email"];

function cellToValue(v) {
  if (v === null || v === undefined) return "";

  if (v instanceof Date) return v.toISOString();

  if (typeof v === "object") {
    if (v.richText) {
      return v.richText
        .map((r) => r.text)
        .join("")
        .trim();
    }

    if (v.result !== undefined) return cellToValue(v.result);
    if (v.text !== undefined) return cellToValue(v.text);

    return "";
  }

  return String(v).trim();
}

/**
 * Reads the first worksheet of an .xlsx or .csv buffer.
 * Row 1 must contain the headers: Name | Age | Email
 *
 * Returns:
 *   rows    - valid, unique records, ready for the database
 *   entries - the same records with their row number: { row, data }
 *   errors  - rejected rows: { row, problems, data }
 *             (data = the name/age/email as found in the file)
 *
 * Duplicate rule: emails are compared case-insensitively. The first row with
 * an email is kept; later rows with the same email are rejected.
 */
export async function parseWorkbook(buffer, isCsv = false) {
  const workbook = new ExcelJS.Workbook();
  if (isCsv) await workbook.csv.read(Readable.from(buffer));
  else await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    throw new Error("The file has no worksheets.");
  }

  const columns = {};

  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = cellToValue(cell.value).toLowerCase().trim();

    if (HEADER_MAP[header]) {
      columns[colNumber] = HEADER_MAP[header];
    }
  });

  const found = new Set(Object.values(columns));
  const missing = REQUIRED.filter((field) => !found.has(field));

  if (missing.length) {
    throw new Error(
      `Missing required column(s): ${missing.join(", ")}. Put headers in row 1.`,
    );
  }

  const rows = [];
  const entries = [];
  const errors = [];
  const seenEmails = new Map(); // lowercase email -> first row number

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const record = {};

    for (const [colNumber, field] of Object.entries(columns)) {
      record[field] = cellToValue(row.getCell(Number(colNumber)).value);
    }

    // Ignore completely blank rows.
    if (Object.values(record).every((value) => value === "")) {
      return;
    }

    const result = Player.safeParse({
      name: record.name,
      age: Number(record.age),
      email: record.email,
    });

    if (!result.success) {
      errors.push({
        row: rowNumber,
        problems: result.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        ),
        data: record, // original values, used for the rejected-rows download
      });
    } else {
      const key = String(result.data.email).trim().toLowerCase();

      if (seenEmails.has(key)) {
        errors.push({
          row: rowNumber,
          problems: [`email: duplicate of row ${seenEmails.get(key)} in this file`],
          data: record,
        });
      } else {
        seenEmails.set(key, rowNumber);
        rows.push(result.data);
        entries.push({ row: rowNumber, data: result.data });
      }
    }
  });

  return { rows, errors, entries };
}