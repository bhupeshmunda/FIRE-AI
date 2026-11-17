import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// --- Tunable Constants ---
export const DELAY_PERCENTILE = 0.8; // 80th percentile of historical delays
export const MIN_ROWS = 10;          // Minimum valid rows required to make a prediction
export const EXPECTED_COLUMNS = 10;  // Number of columns required in data.csv
export const MAX_NOTES_LENGTH = 200; // Maximum allowed characters for Notes
export const MS_PER_DAY = 1000 * 60 * 60 * 24;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_CSV_PATH = path.join(__dirname, "..", "data.csv");

// Parse a YYYY-MM-DD string strictly into a UTC Date object
export function parseStrictDate(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return null;
  }
  const clean = dateStr.trim();
  const date = new Date(`${clean}T00:00:00Z`);
  if (isNaN(date.getTime())) {
    return null;
  }
  // Ensure month/day did not roll over (e.g. 2026-02-31)
  if (date.toISOString().slice(0, 10) !== clean) {
    return null;
  }
  return date;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function diffInDays(laterDate, earlierDate) {
  return Math.round((laterDate.getTime() - earlierDate.getTime()) / MS_PER_DAY);
}

// 1. Load and validate rows from data.csv
export function loadAndValidateRows(csvPath = DEFAULT_CSV_PATH) {
  if (!fs.existsSync(csvPath)) {
    console.warn(`[LaundryTrack] Warning: CSV file not found at ${csvPath}`);
    return { validRows: [], skippedRows: [], fileMissing: true };
  }

  // Strip only leading/trailing newlines, NOT tabs (an empty Notes column ends with \t)
  const rawContent = fs.readFileSync(csvPath, "utf-8").replace(/^[\r\n]+|[\r\n]+$/g, "");
  if (!rawContent.trim()) {
    console.warn(`[LaundryTrack] Warning: CSV file is empty at ${csvPath}`);
    return { validRows: [], skippedRows: [], fileMissing: false };
  }

  const lines = rawContent.split(/\r?\n/);
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim());

  const validRows = [];
  const skippedRows = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1; // Line 1 is header
    const line = lines[i];

    if (!line.trim()) {
      continue;
    }

    const values = line.split(delimiter);
    if (values.length !== EXPECTED_COLUMNS) {
      const reason = `Wrong number of columns (expected ${EXPECTED_COLUMNS}, got ${values.length})`;
      skippedRows.push({ rowNumber: lineNumber, reason, raw: line });
      console.warn(`[CSV Warning] Skipping row ${lineNumber}: ${reason}`);
      continue;
    }

    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] !== undefined ? values[idx].trim() : "";
    });

    const subDate = parseStrictDate(row.Submission_Date);
    const expDate = parseStrictDate(row.Expected_Collection_Date);
    const readyDate = parseStrictDate(row.Actual_Ready_Date);
    const colDate = parseStrictDate(row.Actual_Collection_Date);

    if (!subDate || !expDate || !readyDate || !colDate) {
      const reason = "Invalid or missing date in one of the date columns";
      skippedRows.push({ rowNumber: lineNumber, reason, raw: line });
      console.warn(`[CSV Warning] Skipping row ${lineNumber}: ${reason}`);
      continue;
    }

    const expectedDays = diffInDays(expDate, subDate);
    const processingDays = diffInDays(readyDate, subDate);
    const collectionDays = diffInDays(colDate, subDate);
    const pickupLagDays = diffInDays(colDate, readyDate);

    if (
      expectedDays < 0 ||
      processingDays < 0 ||
      collectionDays < 0 ||
      pickupLagDays < 0
    ) {
      const reason = "Negative duration between submission, ready, or collection dates";
      skippedRows.push({ rowNumber: lineNumber, reason, raw: line });
      console.warn(`[CSV Warning] Skipping row ${lineNumber}: ${reason}`);
      continue;
    }

    const delayDays = diffInDays(readyDate, expDate);

    validRows.push({
      ...row,
      delayDays,
      expectedDays,
      processingDays,
    });
  }

  return { validRows, skippedRows, fileMissing: false };
}

// 2. Validate and append a new outcome row to data.csv
export function validateOutcome(input = {}, csvPath = DEFAULT_CSV_PATH) {
  const errors = [];

  const studentId = String(input.Student_ID ?? "").trim();
  const tokenId = String(input.Token_ID ?? "").trim();
  const subDateStr = String(input.Submission_Date ?? "").trim();
  const expDateStr = String(input.Expected_Collection_Date ?? "").trim();
  const readyDateStr = String(input.Actual_Ready_Date ?? "").trim();
  const colDateStr = String(input.Actual_Collection_Date ?? "").trim();
  const visitsStr = String(input.Counter_Visits ?? "").trim();
  const closedStr = String(input.Found_Shop_Closed ?? "").trim();
  const readyWhenVisitedStr = String(input.Was_Ready_When_Visited ?? "").trim();
  // Replace tabs and newlines with spaces in Notes
  const cleanNotes = String(input.Notes ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();

  // 1. Student_ID matches S\d{3}
  if (!/^S\d{3}$/.test(studentId)) {
    errors.push("Student_ID must match format S followed by 3 digits (e.g., S021).");
  }

  // 2. Token_ID matches LT\d{4}
  if (!/^LT\d{4}$/.test(tokenId)) {
    errors.push("Token_ID must match format LT followed by 4 digits (e.g., LT1021).");
  } else if (fs.existsSync(csvPath)) {
    // Check for duplicate Token_ID in data.csv
    const raw = fs.readFileSync(csvPath, "utf-8").replace(/^[\r\n]+|[\r\n]+$/g, "");
    const lines = raw ? raw.split(/\r?\n/).slice(1) : [];
    const tokenExists = lines.some((line) => {
      const cols = line.split("\t");
      return cols[1] && cols[1].trim() === tokenId;
    });
    if (tokenExists) {
      errors.push(`Token_ID ${tokenId} already exists in data.csv (duplicates are not allowed).`);
    }
  }

  // 3. All four dates are real calendar dates in YYYY-MM-DD format
  const subDate = parseStrictDate(subDateStr);
  const expDate = parseStrictDate(expDateStr);
  const readyDate = parseStrictDate(readyDateStr);
  const colDate = parseStrictDate(colDateStr);

  if (!subDate) {
    errors.push("Submission_Date must be a valid calendar date in YYYY-MM-DD format.");
  }
  if (!expDate) {
    errors.push("Expected_Collection_Date must be a valid calendar date in YYYY-MM-DD format.");
  }
  if (!readyDate) {
    errors.push("Actual_Ready_Date must be a valid calendar date in YYYY-MM-DD format.");
  }
  if (!colDate) {
    errors.push("Actual_Collection_Date must be a valid calendar date in YYYY-MM-DD format.");
  }

  // 4. Date ordering checks
  if (subDate && expDate && diffInDays(expDate, subDate) < 0) {
    errors.push("Expected_Collection_Date must be on or after Submission_Date.");
  }
  if (subDate && readyDate && diffInDays(readyDate, subDate) < 0) {
    errors.push("Actual_Ready_Date must be on or after Submission_Date.");
  }
  if (readyDate && colDate && diffInDays(colDate, readyDate) < 0) {
    errors.push("Actual_Collection_Date must be on or after Actual_Ready_Date.");
  }

  // 5. Counter_Visits is a whole number >= 1
  if (!/^\d+$/.test(visitsStr) || Number(visitsStr) < 1) {
    errors.push("Counter_Visits must be a whole number greater than or equal to 1.");
  }

  // 6. Found_Shop_Closed and Was_Ready_When_Visited are exactly "Yes" or "No"
  if (closedStr !== "Yes" && closedStr !== "No") {
    errors.push('Found_Shop_Closed must be exactly "Yes" or "No".');
  }
  if (readyWhenVisitedStr !== "Yes" && readyWhenVisitedStr !== "No") {
    errors.push('Was_Ready_When_Visited must be exactly "Yes" or "No".');
  }

  // 7. Notes is optional, max 200 characters
  if (cleanNotes.length > MAX_NOTES_LENGTH) {
    errors.push(`Notes must be at most ${MAX_NOTES_LENGTH} characters (got ${cleanNotes.length}).`);
  }

  // Build the exact 10-element array so empty Notes still produces a trailing tab
  const fields = [
    studentId,
    tokenId,
    subDateStr,
    expDateStr,
    readyDateStr,
    colDateStr,
    visitsStr,
    closedStr,
    readyWhenVisitedStr,
    cleanNotes, // "" when empty -> join("\t") keeps the 9th tab (10 fields total)
  ];

  const rowObject = {
    Student_ID: studentId,
    Token_ID: tokenId,
    Submission_Date: subDateStr,
    Expected_Collection_Date: expDateStr,
    Actual_Ready_Date: readyDateStr,
    Actual_Collection_Date: colDateStr,
    Counter_Visits: visitsStr,
    Found_Shop_Closed: closedStr,
    Was_Ready_When_Visited: readyWhenVisitedStr,
    Notes: cleanNotes,
  };

  return {
    valid: errors.length === 0,
    errors,
    fields,
    tsvLine: fields.join("\t"),
    row: rowObject,
  };
}

export function appendOutcomeRow(input, csvPath = DEFAULT_CSV_PATH) {
  const check = validateOutcome(input, csvPath);
  if (!check.valid) {
    return check;
  }

  // Ensure existing file ends with "\n" before appending so we never join onto the last line
  if (fs.existsSync(csvPath)) {
    const existing = fs.readFileSync(csvPath, "utf-8");
    if (existing.length > 0 && !existing.endsWith("\n")) {
      fs.appendFileSync(csvPath, "\n", "utf-8");
    }
  }

  fs.appendFileSync(csvPath, `${check.tsvLine}\n`, "utf-8");
  return check;
}

// 3. Compute historical statistics from valid rows
export function computeStats(validRows) {
  if (!validRows || validRows.length < MIN_ROWS) {
    return {
      enoughData: false,
      validRowCount: validRows ? validRows.length : 0,
      minRows: MIN_ROWS,
    };
  }

  const totalOrders = validRows.length;

  // Sort delays ascending to calculate percentile
  const sortedDelays = validRows
    .map((r) => r.delayDays)
    .sort((a, b) => a - b);

  // Index for DELAY_PERCENTILE, then round up the delay value
  const percentileIndex = Math.max(
    0,
    Math.ceil(DELAY_PERCENTILE * sortedDelays.length) - 1
  );
  const percentileDelayDays = Math.max(0, Math.ceil(sortedDelays[percentileIndex]));

  // Share of orders that were late (Actual_Ready_Date > Expected_Collection_Date)
  const lateOrdersCount = validRows.filter((r) => r.delayDays > 0).length;
  const lateShare = lateOrdersCount / totalOrders;
  const latePercentage = Math.round(lateShare * 100);

  // Average processing days and average shop-expected turnaround from real data
  const totalProcessingDays = validRows.reduce((sum, r) => sum + r.processingDays, 0);
  const avgProcessingDays = +(totalProcessingDays / totalOrders).toFixed(2);

  const totalExpectedDays = validRows.reduce((sum, r) => sum + r.expectedDays, 0);
  const avgExpectedDays = Math.round(totalExpectedDays / totalOrders);

  // Find weekdays where Found_Shop_Closed = Yes (using Expected_Collection_Date when students visit)
  const closedWeekdaySet = new Set();
  for (const row of validRows) {
    if (row.Found_Shop_Closed.toLowerCase() === "yes") {
      const expDate = parseStrictDate(row.Expected_Collection_Date);
      if (expDate) {
        closedWeekdaySet.add(WEEKDAYS[expDate.getUTCDay()]);
      }
    }
  }
  const closedWeekdays = Array.from(closedWeekdaySet);

  return {
    enoughData: true,
    validRowCount: totalOrders,
    minRows: MIN_ROWS,
    delayPercentile: DELAY_PERCENTILE,
    percentileDelayDays,
    lateOrdersCount,
    lateShare,
    latePercentage,
    avgProcessingDays,
    avgExpectedDays,
    closedWeekdays,
  };
}

// 4. Predict readiness and recommended visit date for a single order
export function predictOrder({ Submission_Date, Expected_Collection_Date }, stats) {
  const subDate = parseStrictDate(Submission_Date);
  if (!subDate) {
    return { error: "Please provide a valid Submission Date (YYYY-MM-DD)." };
  }

  let expDate = Expected_Collection_Date
    ? parseStrictDate(Expected_Collection_Date)
    : null;

  if (Expected_Collection_Date && !expDate) {
    return { error: "Please provide a valid Expected Collection Date (YYYY-MM-DD)." };
  }

  const usedFallbackExpected = !expDate;
  if (!expDate) {
    expDate = addDays(subDate, stats.avgExpectedDays);
  }

  if (diffInDays(expDate, subDate) < 0) {
    return {
      error: "Expected Collection Date cannot be earlier than Submission Date.",
    };
  }

  const predictedReadyDateObj = addDays(expDate, stats.percentileDelayDays);

  // Skip any weekdays that had Found_Shop_Closed = Yes in data.csv
  let recommendedDateObj = new Date(predictedReadyDateObj.getTime());
  const skippedClosedDays = [];

  if (stats.closedWeekdays.length > 0 && stats.closedWeekdays.length < 7) {
    while (stats.closedWeekdays.includes(WEEKDAYS[recommendedDateObj.getUTCDay()])) {
      skippedClosedDays.push(WEEKDAYS[recommendedDateObj.getUTCDay()]);
      recommendedDateObj = addDays(recommendedDateObj, 1);
    }
  }

  return {
    submissionDate: formatDate(subDate),
    expectedDate: formatDate(expDate),
    usedFallbackExpected,
    predictedReadyDate: formatDate(predictedReadyDateObj),
    predictedReadyWeekday: WEEKDAYS[predictedReadyDateObj.getUTCDay()],
    recommendedVisitDate: formatDate(recommendedDateObj),
    recommendedVisitWeekday: WEEKDAYS[recommendedDateObj.getUTCDay()],
    skippedClosedDays,
  };
}
