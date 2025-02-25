import { fmt } from './golbalFunction.js';
import { processFirebaseData } from './firebase.js'
import { processPerformanceData } from './sales.js'

const currentDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' });
//Half year of current date
const threeMonthsBefore = new Date(currentDate);
threeMonthsBefore.setMonth(new Date().getMonth() - 3);
//A week before current date
const yesterday = new Date(currentDate);
yesterday.setDate(new Date().getDate() - 1);

const usageAPI = `https://api.appfigures.com/v2/reports/usage?client_key=5ce2b21fe70d432b80caa05a97762d6d&group_by=date,network,products&network=firebase&start_date=${fmt(threeMonthsBefore, true)}&end_date=${fmt(yesterday, true)}`;
const performanceAPI = `https://api.appfigures.com/v2/reports/sales?group_by=dates,product&products=334364831261,334364831192&client_key=5ce2b21fe70d432b80caa05a97762d6d&start_date=${fmt(threeMonthsBefore, true)}&end_date=${fmt(yesterday, true)}`;


try {
    await processFirebaseData(threeMonthsBefore, yesterday, usageAPI);

    // After processFirebaseData finishes, call processPerformanceData
    await processPerformanceData(threeMonthsBefore, yesterday, performanceAPI);

    console.log("All data processes completed successfully.");
  } catch (error) {
    console.error("An error occurred:", error);
  }
