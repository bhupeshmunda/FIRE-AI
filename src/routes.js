import express from "express";
import { renderHome, renderRecords, predictLaundry } from "./controller.js";

const router = express.Router();

// GET "/" -> Renders home.ejs where user enters CSV laundry details
router.get("/", renderHome);

// GET "/records" -> Renders records.ejs showing all recorded CSV entries
router.get("/records", renderRecords);

// GET "/prediction" -> Redirects to home form if accessed directly without form data
router.get("/prediction", (req, res) => {
  res.redirect("/");
});

// POST "/prediction" -> Processes submitted CSV details and renders prediction.ejs
router.post("/prediction", predictLaundry);

export default router;
