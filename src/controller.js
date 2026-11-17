import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvFilePath = path.join(__dirname, "..", "data.csv");

// Helper to parse data.csv (tab or comma separated)
export const getCsvRecords = () => {
  try {
    if (!fs.existsSync(csvFilePath)) return [];
    const content = fs.readFileSync(csvFilePath, "utf-8").trim();
    if (!content) return [];

    const lines = content.split(/\r?\n/);
    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(delimiter).map((h) => h.trim());

    return lines.slice(1).filter(Boolean).map((line) => {
      const values = line.split(delimiter);
      const record = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ? values[index].trim() : "";
      });
      return record;
    });
  } catch (err) {
    console.error("Error reading CSV:", err);
    return [];
  }
};

// GET / - Render home.ejs with CSV form
export const renderHome = (req, res) => {
  res.render("home", {
    title: "Home – Submit & Track Laundry",
    saved: req.query.saved === "true",
  });
};

// GET /records - Render records.ejs with recorded CSV dataset
export const renderRecords = (req, res) => {
  const records = getCsvRecords();
  res.render("records", {
    title: "Recorded Laundry Dataset",
    records,
  });
};

// POST /predict - Process form details from home.ejs and render prediction.ejs
export const predictLaundry = (req, res) => {
  const {
    Student_ID,
    Token_ID,
    Submission_Date,
    Expected_Collection_Date,
    Actual_Ready_Date,
    Actual_Collection_Date,
    Counter_Visits,
    Found_Shop_Closed,
    Was_Ready_When_Visited,
    Notes,
    saveToCsv,
  } = req.body;

  // Optionally append to data.csv if user checked "Save record to data.csv"
  if (saveToCsv === "yes" && Student_ID && Token_ID) {
    const newRow = [
      Student_ID,
      Token_ID,
      Submission_Date || "",
      Expected_Collection_Date || "",
      Actual_Ready_Date || "",
      Actual_Collection_Date || "",
      Counter_Visits || "1",
      Found_Shop_Closed || "No",
      Was_Ready_When_Visited || "No",
      (Notes || "").replace(/[\r\n\t]+/g, " "),
    ].join("\t");

    fs.appendFileSync(csvFilePath, `\n${newRow}`, "utf-8");
  }

  const records = getCsvRecords();

  // Compute historical statistics from data.csv
  const totalOrders = records.length || 20;
  let delayedOrders = 0;
  let totalProcessingDays = 0;
  let validProcessingCount = 0;

  records.forEach((r) => {
    const sub = new Date(r.Submission_Date);
    const exp = new Date(r.Expected_Collection_Date);
    const act = new Date(r.Actual_Ready_Date);

    if (!isNaN(sub) && !isNaN(act)) {
      const procDays = Math.round((act - sub) / (1000 * 60 * 60 * 24));
      totalProcessingDays += procDays;
      validProcessingCount++;
    }
    if (!isNaN(exp) && !isNaN(act) && act > exp) {
      delayedOrders++;
    }
  });

  const avgProcessingDays =
    validProcessingCount > 0
      ? (totalProcessingDays / validProcessingCount).toFixed(1)
      : 3.8;
  const delayRate = Math.round((delayedOrders / totalOrders) * 100);

  // Calculate predicted ready date & recommended visit date
  const subDate = Submission_Date ? new Date(Submission_Date) : new Date();
  const expDate = Expected_Collection_Date
    ? new Date(Expected_Collection_Date)
    : new Date(subDate.getTime() + 4 * 24 * 60 * 60 * 1000);

  // Historical data shows 45% (9/20) of orders take +1 extra day beyond expected date
  const predictedReadyDateObj = new Date(expDate.getTime() + 1 * 24 * 60 * 60 * 1000);

  // Avoid Sunday closure if recommended date lands on Sunday (day 0)
  const recommendedVisitDateObj = new Date(predictedReadyDateObj);
  let SundayAdjusted = false;
  if (recommendedVisitDateObj.getDay() === 0) {
    recommendedVisitDateObj.setDate(recommendedVisitDateObj.getDate() + 1);
    SundayAdjusted = true;
  }

  const formatDate = (d) =>
    !isNaN(d) ? d.toISOString().split("T")[0] : "N/A";

  res.render("prediction", {
    title: "Laundry Readiness Prediction",
    formData: {
      Student_ID,
      Token_ID,
      Submission_Date,
      Expected_Collection_Date,
      Actual_Ready_Date,
      Actual_Collection_Date,
      Counter_Visits,
      Found_Shop_Closed,
      Was_Ready_When_Visited,
      Notes,
    },
    prediction: {
      expectedDate: formatDate(expDate),
      predictedReadyDate: Actual_Ready_Date || formatDate(predictedReadyDateObj),
      recommendedVisitDate: formatDate(recommendedVisitDateObj),
      SundayAdjusted,
      avgProcessingDays,
      delayRate,
      totalOrders,
    },
  });
};
