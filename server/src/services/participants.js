// CSV import of paid participants (Razorpay export or any CSV with an email column).
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');
const User = require('../models/User');
const Attempt = require('../models/Attempt');
const { ApiError } = require('../utils/http');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L confusion
function newAccessCode(len = 8) {
  let s = '';
  for (let i = 0; i < len; i += 1) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAID_VALUES = new Set(['captured', 'paid', 'success', 'successful', 'completed', 'authorized']);

function pickColumn(headers, explicit, patterns) {
  if (explicit) {
    const found = headers.find((h) => h.toLowerCase() === String(explicit).toLowerCase());
    if (!found) throw new ApiError(400, 'VALIDATION_ERROR', `Column "${explicit}" not found in CSV`);
    return found;
  }
  for (const p of patterns) {
    const found = headers.find((h) => p.test(h.trim()));
    if (found) return found;
  }
  return null;
}

// Razorpay puts payment-page fields inside "notes" as JSON (sometimes) – read name/phone from there.
function fromNotes(notes, key) {
  if (!notes) return '';
  try {
    const obj = JSON.parse(notes);
    const k = Object.keys(obj).find((x) => x.toLowerCase().includes(key));
    return k ? String(obj[k]) : '';
  } catch {
    const m = new RegExp(`${key}[^:=]*[:=]\\s*([^,;|]+)`, 'i').exec(notes);
    return m ? m[1].trim() : '';
  }
}

/**
 * opts: { emailColumn?, nameColumn?, phoneColumn?, statusColumn?, onlyPaid=true, filterColumn?, filterValue? }
 */
function parseParticipants(buffer, opts = {}) {
  let records;
  try {
    records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  } catch (e) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Could not read CSV: ${e.message}`);
  }
  if (!records.length) throw new ApiError(400, 'VALIDATION_ERROR', 'CSV has no rows');
  const headers = Object.keys(records[0]);

  const emailCol = pickColumn(headers, opts.emailColumn, [/^e-?mail$/i, /email/i]);
  if (!emailCol) throw new ApiError(400, 'VALIDATION_ERROR', 'No email column found. Set "Email column".');
  const nameCol = pickColumn(headers, opts.nameColumn, [/^(full[ _]?)?name$/i, /student.*name|participant.*name|^name/i]);
  const phoneCol = pickColumn(headers, opts.phoneColumn, [/^contact$/i, /phone|mobile|contact/i]);
  const statusCol = pickColumn(headers, opts.statusColumn, [/^status$/i, /payment.?status/i]);
  const notesCol = headers.find((h) => /^notes$/i.test(h));
  // Filter column can be a real CSV column or a key inside Razorpay's "notes" JSON (e.g. "category").
  let filterCol = null;
  let filterInNotes = false;
  if (opts.filterColumn) {
    filterCol = headers.find((h) => h.toLowerCase() === String(opts.filterColumn).toLowerCase()) || null;
    if (!filterCol && notesCol) filterInNotes = true;
    else if (!filterCol) throw new ApiError(400, 'VALIDATION_ERROR', `Column "${opts.filterColumn}" not found in CSV`);
  }

  const out = [];
  const skipped = { notPaid: 0, badEmail: 0, filtered: 0, duplicate: 0 };
  const seen = new Set();
  for (const row of records) {
    if (opts.onlyPaid !== false && statusCol && !PAID_VALUES.has(String(row[statusCol]).toLowerCase())) {
      skipped.notPaid += 1;
      continue;
    }
    const filterActual = filterCol ? row[filterCol] : filterInNotes ? fromNotes(row[notesCol], String(opts.filterColumn).toLowerCase()) : null;
    if (opts.filterColumn && String(filterActual ?? '').trim().toLowerCase() !== String(opts.filterValue || '').trim().toLowerCase()) {
      skipped.filtered += 1;
      continue;
    }
    const email = String(row[emailCol] || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      skipped.badEmail += 1;
      continue;
    }
    if (seen.has(email)) {
      skipped.duplicate += 1;
      continue;
    }
    seen.add(email);
    const name =
      (nameCol && row[nameCol]) || fromNotes(notesCol && row[notesCol], 'name') || email.split('@')[0];
    const phone = String((phoneCol && row[phoneCol]) || fromNotes(notesCol && row[notesCol], 'phone') || '')
      .replace(/[^\d+]/g, '')
      .slice(0, 20);
    const meta = {};
    for (const h of headers) {
      if (![emailCol, nameCol, phoneCol].includes(h) && row[h] !== '' && Object.keys(meta).length < 12) {
        meta[h.slice(0, 40)] = String(row[h]).slice(0, 200);
      }
    }
    out.push({ email, name: String(name).trim().slice(0, 120), phone, meta });
  }
  return { rows: out, skipped, columns: { email: emailCol, name: nameCol, phone: phoneCol, status: statusCol } };
}

/** Upserts users and creates NOT_STARTED attempts for the contest. Existing access codes are kept. */
async function importParticipants(contestId, rows) {
  let createdUsers = 0;
  let enrolled = 0;
  let alreadyEnrolled = 0;
  let skippedAdmins = 0;
  for (const r of rows) {
    let user = await User.findOne({ email: r.email }).select('+accessCode');
    if (user && user.role === 'ADMIN') {
      skippedAdmins += 1;
      continue;
    }
    if (!user) {
      user = await User.create({ ...r, role: 'CANDIDATE', accessCode: newAccessCode() });
      createdUsers += 1;
    } else {
      let dirty = false;
      if (!user.accessCode) {
        user.accessCode = newAccessCode();
        dirty = true;
      }
      if (r.phone && !user.phone) {
        user.phone = r.phone;
        dirty = true;
      }
      if (dirty) await user.save();
    }
    const res = await Attempt.updateOne(
      { contestId, userId: user._id },
      { $setOnInsert: { contestId, userId: user._id, status: 'NOT_STARTED' } },
      { upsert: true }
    );
    if (res.upsertedCount) enrolled += 1;
    else alreadyEnrolled += 1;
  }
  return { createdUsers, enrolled, alreadyEnrolled, skippedAdmins };
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  const safe = /^[=@\t\r]|^[+-](?![\d\s])/.test(s) ? `'${s}` : s; // block CSV formula injection in Excel
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const toCsv = (header, rows) => [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');

module.exports = { parseParticipants, importParticipants, newAccessCode, toCsv };
