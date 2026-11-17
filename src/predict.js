import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// --- Tunable Constants ---
export const DELAY_PERCENTILE = 0.8; // 80th percentile of historical delays
export const MIN_ROWS = 10;          // Minimum valid rows required to make a prediction
export const EXPECTED_COLUMNS = 10;  // Number of columns required in data.csv
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
function parseStrictDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return null;
  }
  const date = new Date(`${dateStr.trim()}T00:00:00Z`);
  if (isNaN(date.getTime())) {
    return null;
  }
  // Ensure month/day did not roll over (e.g. 2026-02-31)
  if (date.toISOString().slice(0, 10) !== dateStr.trim()) {
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

  const rawContent = fs.readFileSync(csvPath, "utf-8").trim();
  if (!rawContent) {
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
      row[header] = values[idx] ? values[idx].trim() : "";
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

// 2. Compute historical statistics from valid rows
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

// 3. Predict readiness and recommended visit date for a single order
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
