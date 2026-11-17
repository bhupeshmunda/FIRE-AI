# LaundryTrack

## 1. The Problem and the Place

- **Place:** Hostel K, NIT Jamshedpur
- **Problem:** Students submitting clothes at the hostel laundry counter do not know accurately when their laundry will be ready or which days the shop is closed. In `data.csv` (20 orders), 9 out of 20 orders were ready 1 day later than the date given by the counter, and even orders that were ready on time needed about 1.6 counter visits on average (1.95 across all orders). 3 orders involved a visit to a closed shop.
- **What LaundryTrack Does:** Reads `data.csv`, works out how late the shop usually is (80th percentile of past delays), predicts the ready date for a new order, and recommends a visit date that avoids the shop's closed days.

## 2. Fieldwork Context (Person and Date)

- **Observed / Conducted by:** Bhupesh
- **Counter operator:** TODO: name and role of the person at the counter
- **People interviewed:**
  - Amar on 17/11/26 at 4:30 PM
  - Amit on 17/11/26 at 5:45 PM
- **Observation date and window:** 17/11/26, 4:00 PM – 6:00 PM
- **Shop closed on:** TODO: day(s) the operator told me
- Full notes, photos and how the data was collected: see `fieldwork.md`.

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
- `http://localhost:3000/records` – View all valid rows from `data.csv` and any skipped malformed rows (test with `test/bad-rows.tsv` via `/records?source=bad-rows`).

To change how it predicts, edit the constants at the top of `src/predict.js` (`DELAY_PERCENTILE`, `MIN_ROWS`).

## 4. Real Output

Input: submission date 18/11/26, date promised by the counter 22/11/26.

Output: the app predicts the clothes will be ready on **23/11/26 (Monday)**, one day after the promised date, and recommends visiting on 23/11/26.

Why 23 and not 22: in `data.csv`, 9 of 20 orders (45%) were ready one day later than promised, and the 80th-percentile delay is 1 day, so the tool adds 1 day to the promised date (22 + 1 = 23).

```text
TODO: paste the exact text shown on the app's result page (or a screenshot link) from your own run
```

Demo recording (3 minutes): TODO: link

## 5. What It Gets Wrong

- **Small sample size (20 rows):** Predictions are computed from only 20 orders at one counter. A single unusual week can change the result.
- **It only learns one thing, the usual delay.** Service type, number of clothes and busy days are not in the data, so they are ignored.
- **Closed days are a guess from the data.** Rows say a student found the shop closed, but not on which day, so the code uses the promised date of those rows as a stand-in. Check it against what the operator said.
- **Estimates only, not live status:** The app adds a statistical buffer to the promised date. It cannot see the laundry rack.
- **Not connected to the shop's register:** Students may still need to confirm with the staff.
- **Rush periods and breakdowns:** Exam weeks, festival breaks, rain (slow drying) and machine problems cause backlogs that a percentile of past rows cannot predict.