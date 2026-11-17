import express from "express";
import {
  renderHome,
  predictLaundry,
  renderOutcomeForm,
  saveOutcome,
  renderRecords,
} from "./controller.js";

const router = express.Router();

// Prediction flow
router.get("/", renderHome);
router.get("/prediction", (req, res) => res.redirect("/"));
router.post("/prediction", predictLaundry);

// Record real outcome later (appends to data.csv)
router.get("/outcome", renderOutcomeForm);
router.post("/outcome", saveOutcome);

// View dataset & skipped rows
router.get("/records", renderRecords);

export default router;
