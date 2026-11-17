# LaundryTrack

## 1. The Problem and the Place

- **Place:** `<Hostel / College Laundry Counter Name, Campus Location>`
- **Problem:** Students submitting clothes at the hostel laundry counter do not know accurately when their laundry will be ready or which days the shop is closed. In our field dataset (`data.csv`, 20 orders), 9 out of 20 orders were ready 1 day later than the expected date given by the counter, and even on-time orders required an average of nearly 2 counter visits. Students also wasted trips when the counter was closed.
- **What LaundryTrack Does:** Uses historical student laundry logs (`data.csv`) to estimate an order's ready date using the 80th percentile of historical delays, warns about weekdays when the shop was found closed in the data, and recommends a collection date.

## 2. Fieldwork Context (Person and Date)

- **Observed / Conducted by:** `<Your Name and Roll Number>`
- **People Interviewed:**
  - `<Student 1 Name (e.g., Amar, S001)>` on `<Interview Date>` at `<4:30 PM>`
  - `<Student 2 Name (e.g., Amit, S002)>` on `<Interview Date>` at `<5:45 PM>`
- **Laundry Counter Staff / Operator:** `<Shop Operator Name>`
- **Observation Date & Window:** `<Observation Date, e.g., 20 October 2026>`, `<4:00 PM – 6:00 PM>`

## 3. How to Run

1. Install dependencies from the project root:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open in your browser:
   ```text
   http://localhost:3000
   ```

### Pages Available
- `http://localhost:3000/` – Enter `Student_ID`, `Token_ID`, `Submission_Date`, and optional `Expected_Collection_Date` to predict when clothes will be ready.
- `http://localhost:3000/outcome` – Record an order's actual ready date, collection date, visits, and shop-closed status later (appends to `data.csv`).
- `http://localhost:3000/records` – View all valid rows from `data.csv` and any skipped malformed rows (can also test `test/bad-rows.tsv` via `/records?source=bad-rows`).

## 4. Real Output

```text
<Paste real output / console log / prediction result here>
```

## 5. What It Gets Wrong

- **Small sample size (20 rows):** Predictions and closed-day detection are computed from only 20 recorded orders in `data.csv`. A single unusual week or missing weekday can skew the statistics.
- **Estimates only (not live status):** The app calculates a statistical buffer (`Expected_Collection_Date` + 80th percentile delay) rather than checking the physical laundry rack.
- **Not connected to the shop's internal system:** LaundryTrack has no live link to the laundry counter's paper register or staff workflow, so students still rely on historical patterns.
- **Ignores rush periods and weather:** Exam weeks, festival breaks, heavy rain (slow drying), or machine breakdowns cause sudden multi-day backlogs that a fixed percentile from past rows cannot anticipate.
