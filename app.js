import { fmt } from './golbalFunction.js';
import { processFirebaseData } from './usage.js'
import { processPerformanceData } from './sales.js'
import express from 'express';

const app = express();
const currentDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' });
const port = process.env.PORT || 8080;

//Half year of current date
const threeMonthsBefore = new Date(currentDate);
threeMonthsBefore.setMonth(new Date().getMonth() - 3);
//A week before current date
const today = new Date(currentDate);
today.setDate(new Date().getDate());

const usageAPI = `https://api.appfigures.com/v2/reports/usage?client_key=5ce2b21fe70d432b80caa05a97762d6d&group_by=date,network,products&network=firebase&start_date=${fmt(threeMonthsBefore, true)}&end_date=${fmt(today, true)}`;
const performanceAPI = `https://api.appfigures.com/v2/reports/sales?group_by=dates,product&products=334364831261,334364831192&client_key=5ce2b21fe70d432b80caa05a97762d6d&start_date=${fmt(threeMonthsBefore, true)}&end_date=${fmt(today, true)}`;

app.listen(port, async () => {
try {
    await processFirebaseData(threeMonthsBefore, today, usageAPI);

    // After processFirebaseData finishes, call processPerformanceData
    await processPerformanceData(threeMonthsBefore, today, performanceAPI);

    console.log("All data processes completed successfully.");
  } catch (error) {
    console.error("An error occurred:", error);
  }}
);