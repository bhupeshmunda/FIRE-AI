import path from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_CSV_PATH,
  MIN_ROWS,
  loadAndValidateRows,
  computeStats,
  predictOrder,
  appendOutcomeRow,
} from "./predict.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BAD_ROWS_TEST_PATH = path.join(__dirname, "..", "test", "bad-rows.tsv");

// GET / -> Render prediction form
export const renderHome = (req, res) => {
  res.render("home", {
    title: "Home – Predict Laundry Readiness",
  });
};

// POST /prediction -> Compute stats & predict ready date
export const predictLaundry = (req, res) => {
  const {
    Student_ID,
    Token_ID,
    Submission_Date,
    Expected_Collection_Date,
  } = req.body;

  const { validRows, skippedRows, fileMissing } = loadAndValidateRows(DEFAULT_CSV_PATH);

  if (fileMissing) {
    return res.status(500).render("error", {
      title: "Dataset Missing",
      heading: "data.csv Not Found",
      message: `Could not find data.csv. At least ${MIN_ROWS} valid historical rows are required before LaundryTrack can make predictions.`,
      skippedRows: [],
    });
  }

  const stats = computeStats(validRows);
  if (!stats.enoughData) {
    return res.status(400).render("error", {
      title: "Insufficient Data",
      heading: "Not Enough Valid Rows in data.csv",
      message: `Found only ${stats.validRowCount} valid row(s) in data.csv, but at least MIN_ROWS = ${stats.minRows} valid rows are required to compute reliable statistics.`,
      skippedRows,
    });
  }

  const result = predictOrder(
    { Submission_Date, Expected_Collection_Date },
    stats
  );

  if (result.error) {
    return res.status(400).render("error", {
      title: "Invalid Input",
      heading: "Invalid Form Dates",
      message: result.error,
      skippedRows: [],
    });
  }

  res.render("prediction", {
    title: "Laundry Readiness Prediction",
    formData: {
      Student_ID: (Student_ID || "").trim(),
      Token_ID: (Token_ID || "").trim(),
      Submission_Date,
      Expected_Collection_Date,
    },
    stats,
    prediction: result,
  });
};

// GET /outcome -> Render form to record an order's real outcome later
export const renderOutcomeForm = (req, res) => {
  res.render("outcome", {
    title: "Record Actual Laundry Outcome",
    errors: [],
    savedRow: null,
    formData: {},
  });
};

// POST /outcome -> Validate first, then append completed order outcome to data.csv
export const saveOutcome = (req, res) => {
  const result = appendOutcomeRow(req.body, DEFAULT_CSV_PATH);

  if (!result.valid) {
    return res.status(400).render("outcome", {
      title: "Record Actual Laundry Outcome",
      errors: result.errors,
      savedRow: null,
      formData: req.body || {},
    });
  }

  res.render("outcome", {
    title: "Record Actual Laundry Outcome",
    errors: [],
    savedRow: result.row,
    formData: {},
  });
};

// GET /records -> Show valid rows and any skipped bad rows
export const renderRecords = (req, res) => {
  const useBadTestFile = req.query.source === "bad-rows";
  const targetPath = useBadTestFile ? BAD_ROWS_TEST_PATH : DEFAULT_CSV_PATH;
  const { validRows, skippedRows, fileMissing } = loadAndValidateRows(targetPath);

  if (fileMissing) {
    return res.status(500).render("error", {
      title: "Dataset Missing",
      heading: "CSV File Not Found",
      message: `The requested file (${path.basename(targetPath)}) does not exist.`,
      skippedRows: [],
    });
  }

  res.render("records", {
    title: "Recorded Laundry Dataset",
    records: validRows,
    skippedRows,
    saved: req.query.saved === "true",
    sourceLabel: useBadTestFile ? "test/bad-rows.tsv" : "data.csv",
  });
};
