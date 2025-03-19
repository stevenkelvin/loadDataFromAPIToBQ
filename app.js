import { fmt } from './golbalFunction.js';
import { processFirebaseData } from './usage.js'
import { processSalesAPI } from './sales.js'
import express from 'express';

const app = express();
const currentDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' });
const port = process.env.PORT

//3 months before current date
const threeMonthsBefore = new Date(currentDate);
threeMonthsBefore.setMonth(new Date().getMonth() - 3);
//Current date
const today = new Date(currentDate);
today.setDate(new Date().getDate());

const usageAPI = `https://api.appfigures.com/v2/report/usage?client_key=5ce2b21fe70d432b80caa05a97762d6d&network=firebase&products=334364831261,334364831192&group_by=dates,products,country&start_date=${fmt(threeMonthsBefore, true)}&end_date=${fmt(today, true)}`;
const salesAPI = `https://api.appfigures.com/v2/reports/sales?group_by=dates,product,country&products=334364831261,334364831192&client_key=5ce2b21fe70d432b80caa05a97762d6d&start_date=${fmt(threeMonthsBefore, true)}&end_date=${fmt(today, true)}`;

app.get('/', async (req, res) => {
  try {
    res.send('The data is transferring to BigQuery, please wait for a moment.');
    await processFirebaseData(threeMonthsBefore, today, usageAPI);
    // After processFirebaseData finishes, call processSalesAPI
    await processSalesAPI(threeMonthsBefore, today, salesAPI);
    console.log("All data processes completed successfully.");
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).send("An error occurred while processing data.");
  }
});

app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
});