import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadAndValidateRows,
  appendOutcomeRow,
} from "../src/predict.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempCsvPath = path.join(__dirname, "temp-outcome-test.tsv");

const HEADER =
  "Student_ID\tToken_ID\tSubmission_Date\tExpected_Collection_Date\tActual_Ready_Date\tActual_Collection_Date\tCounter_Visits\tFound_Shop_Closed\tWas_Ready_When_Visited\tNotes";

const INITIAL_ROW =
  "S001\tLT1001\t2026-10-20\t2026-10-23\t2026-10-23\t2026-10-24\t2\tNo\tNo\tReady on expected date.";

try {
  // 1. Setup temporary CSV WITHOUT a trailing newline (tests missing trailing newline)
  fs.writeFileSync(tempCsvPath, `${HEADER}\n${INITIAL_ROW}`, "utf-8");
  assert.strictEqual(
    fs.readFileSync(tempCsvPath, "utf-8").endsWith("\n"),
    false,
    "Precondition: temp file should not end with newline"
  );

  // 2. Test valid row (and missing trailing newline handling)
  const validResult = appendOutcomeRow(
    {
      Student_ID: "S021",
      Token_ID: "LT1021",
      Submission_Date: "2026-11-10",
      Expected_Collection_Date: "2026-11-13",
      Actual_Ready_Date: "2026-11-14",
      Actual_Collection_Date: "2026-11-14",
      Counter_Visits: "2",
      Found_Shop_Closed: "No",
      Was_Ready_When_Visited: "Yes",
      Notes: "Collected on second visit.\nHad a newline.",
    },
    tempCsvPath
  );
  assert.strictEqual(validResult.valid, true, "Valid row should pass validation");
  assert.strictEqual(validResult.fields.length, 10, "Should build 10 fields");

  // 3. Test empty Notes (must still have 10 fields / 9 tabs and load back cleanly)
  const emptyNotesResult = appendOutcomeRow(
    {
      Student_ID: "S022",
      Token_ID: "LT1022",
      Submission_Date: "2026-11-11",
      Expected_Collection_Date: "2026-11-14",
      Actual_Ready_Date: "2026-11-14",
      Actual_Collection_Date: "2026-11-15",
      Counter_Visits: "1",
      Found_Shop_Closed: "No",
      Was_Ready_When_Visited: "Yes",
      Notes: "",
    },
    tempCsvPath
  );
  assert.strictEqual(emptyNotesResult.valid, true, "Empty Notes row should be valid");
  assert.strictEqual(
    emptyNotesResult.tsvLine.split("\t").length,
    10,
    "Empty Notes row must still have 10 tab-separated fields"
  );
  assert.strictEqual(
    emptyNotesResult.tsvLine.endsWith("\t"),
    true,
    "Empty Notes row must end with a trailing tab"
  );

  // Verify loadAndValidateRows reads all 3 rows with 0 skipped rows
  const loadedAfterValid = loadAndValidateRows(tempCsvPath);
  assert.strictEqual(loadedAfterValid.validRows.length, 3, "Should load all 3 valid rows");
  assert.strictEqual(loadedAfterValid.skippedRows.length, 0, "Should have 0 skipped rows");
  assert.strictEqual(loadedAfterValid.validRows[2].Notes, "", "Empty Notes should read back as empty string");

  const snapshotBeforeInvalid = fs.readFileSync(tempCsvPath, "utf-8");

  // 4. Test bad date (must fail validation and NOT modify CSV)
  const badDateResult = appendOutcomeRow(
    {
      Student_ID: "S023",
      Token_ID: "LT1023",
      Submission_Date: "2026-02-30", // Invalid calendar date
      Expected_Collection_Date: "2026-11-14",
      Actual_Ready_Date: "2026-11-14",
      Actual_Collection_Date: "2026-11-15",
      Counter_Visits: "1",
      Found_Shop_Closed: "No",
      Was_Ready_When_Visited: "Yes",
      Notes: "",
    },
    tempCsvPath
  );
  assert.strictEqual(badDateResult.valid, false, "Bad date must fail validation");
  assert.strictEqual(
    fs.readFileSync(tempCsvPath, "utf-8"),
    snapshotBeforeInvalid,
    "CSV file must not be touched when bad date fails"
  );

  // 5. Test duplicate Token_ID (must fail validation and NOT modify CSV)
  const duplicateTokenResult = appendOutcomeRow(
    {
      Student_ID: "S024",
      Token_ID: "LT1021", // Already exists
      Submission_Date: "2026-11-12",
      Expected_Collection_Date: "2026-11-15",
      Actual_Ready_Date: "2026-11-15",
      Actual_Collection_Date: "2026-11-15",
      Counter_Visits: "1",
      Found_Shop_Closed: "No",
      Was_Ready_When_Visited: "Yes",
      Notes: "Duplicate token test",
    },
    tempCsvPath
  );
  assert.strictEqual(duplicateTokenResult.valid, false, "Duplicate token must fail validation");
  assert.ok(
    duplicateTokenResult.errors.some((e) => e.includes("already exists")),
    "Error message should mention duplicate token"
  );
  assert.strictEqual(
    fs.readFileSync(tempCsvPath, "utf-8"),
    snapshotBeforeInvalid,
    "CSV file must not be touched when duplicate token fails"
  );

  console.log("All 5 outcome tests passed (valid row, empty Notes, bad date, duplicate token, missing trailing newline).");
} finally {
  if (fs.existsSync(tempCsvPath)) {
    fs.unlinkSync(tempCsvPath);
  }
}
