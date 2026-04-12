import { UserRole } from '../types';

export interface ParsedRow {
  email: string;
  role: UserRole;       // set by global selector, not parsed from CSV
  companyId: string;    // set by global selector or derived
  companyName: string;  // derived from email domain for company_admin
  errors: string[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseRawCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  return lines.map(line => {
    const delimiter = line.includes('\t') ? '\t' : ',';
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  });
}

/**
 * Parse CSV/text into ParsedRows. Only the email column is used.
 * Accepts a header row (detected by presence of "email" in first row),
 * or treats the first column as email if no header is found.
 */
export function parseCsvText(text: string): ParsedRow[] {
  const rawRows = parseRawCsv(text);
  if (rawRows.length === 0) return [];

  let dataRows = rawRows;
  let emailIdx = 0;

  const firstRow = rawRows[0].map(h => h.toLowerCase().trim());
  if (firstRow.some(h => h === 'email')) {
    emailIdx = firstRow.indexOf('email');
    dataRows = rawRows.slice(1);
  }

  return dataRows
    .map((cols): ParsedRow => {
      const email = (cols[emailIdx] ?? '').toLowerCase().trim();
      const errors: string[] = [];
      if (!email) errors.push('Email is required');
      else if (!EMAIL_REGEX.test(email) || email.length > 254) errors.push('Invalid email format');
      return { email, role: UserRole.USER, companyId: '', companyName: '', errors };
    })
    .filter(row => row.email || row.errors.length > 0);
}

/** Add "duplicate email" errors for repeated emails within the batch. */
export function validateRows(rows: ParsedRow[]): ParsedRow[] {
  const seen = new Set<string>();
  return rows.map(row => {
    if (!row.email) return row;
    if (seen.has(row.email)) {
      return { ...row, errors: [...row.errors.filter(e => e !== 'Duplicate email in this import'), 'Duplicate email in this import'] };
    }
    seen.add(row.email);
    return row;
  });
}

/** Download template — just an email column. */
export function generateCsvTemplate(): string {
  return 'email\njohn@acme.com\njane@bigcorp.com\n';
}
