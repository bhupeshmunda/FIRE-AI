import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import ejsMate from "ejs-mate";
import router from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Set up ejs-mate and views directory
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Parse form and JSON payloads
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Mount routes
app.use("/", router);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

export default app;
