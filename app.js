import { fmt } from './golbalFunction.js';
import { processSalesAPI } from './sales.js';

// Set current date in Hong Kong timezone
const currentDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' });

// 3 months before current date
const threeMonthsBefore = new Date(currentDate);
threeMonthsBefore.setMonth(new Date().getMonth() - 3);

// Current date
const today = new Date(currentDate);
today.setDate(new Date().getDate());

const salesAPI = `https://api.appfigures.com/v2/reports/sales?group_by=dates,product,country&products=334364831261,334364831192&client_key=5ce2b21fe70d432b80caa05a97762d6d&start_date=${fmt(threeMonthsBefore, true)}&end_date=${fmt(today, true)}`;

try {
  console.log('The data is transferring to BigQuery, please wait for a moment.');
  await processSalesAPI(threeMonthsBefore, today, salesAPI);
  console.log("All data processes completed successfully.");
} catch (error) {
  console.error("An error occurred:", error);
}