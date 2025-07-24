import {
  fmt,
  getDataFromAPI,
  bqData,
  createTable,
  checkMatchingItems,
  loadDataToBQ,
  clearBQData,
  tableExists,
  huaweiAPItoken,
  huaweiAPIdata
} from './golbalFunction.js';
import { styleText } from 'node:util';

const datasetId = "marketplace";
let huaweiToken = null;
const MAX_PARALLEL = 4; // adjust to control parallelism & not overload API/BQ

const metricKeys = ['downloads', 're_downloads', 'uninstalls', 'updates'];
const schema = {
  fields: [
    { name: 'date', type: 'DATE' },
    { name: 'platform', type: 'STRING' },
    { name: 'downloads', type: 'INTEGER' },
    { name: 're_downloads', type: 'INTEGER' },
    { name: 'uninstalls', type: 'INTEGER' },
    { name: 'updates', type: 'INTEGER' },
    { name: 'country', type: 'STRING' },
  ],
};

const clean = (row, platform) => {
  row.platform = platform;
  if (platform === 'iOS' || platform === 'Android') {
    [
      'returns', 'net_downloads', 'promos', 'revenue', 'returns_amount',
      'edu_downloads', 'gifts', 'gift_redemptions', 'edu_revenue', 'gross_revenue',
      'gross_returns_amount', 'gross_edu_revenue', 'business_downloads', 'business_revenue',
      'gross_business_revenue', 'standard_downloads', 'standard_revenue', 'gross_standard_revenue',
      'app_downloads', 'app_returns', 'iap_amount', 'iap_returns', 'subscription_purchases',
      'subscription_returns', 'app_revenue', 'app_returns_amount', 'gross_app_revenue',
      'gross_app_returns_amount', 'iap_revenue', 'iap_returns_amount', 'gross_iap_revenue',
      'gross_iap_returns_amount', 'subscription_revenue', 'subscription_returns_amount',
      'gross_subscription_revenue', 'gross_subscription_returns_amount', 'pre_orders',
      'product_id', 'iso'
    ].forEach(prop => delete row[prop]);
  } else if (platform === 'Huawei') {
    [
      'Valid impressions', 'Details UV (reported by client)', 'Valid impression CTR',
      'Details page conversion rate', 'Successful installs', 'Installation success rate',
      'Sharings', 'Icon clicks', 'New installs', 'Total uninstalls'
    ].forEach(prop => delete row[prop]);
    row['Country/Region'] = row['Country/Region']
      .replace('Hong Kong(China)', 'Hong Kong')
      .replace('Chinese mainland', 'China')
      .replace('Macau(China)', 'Macao')
      .replace('Taiwan(China)', 'Taiwan')
      .replace('UK', 'United Kingdom');
    row['country'] = row['Country/Region'];
    delete row['Country/Region'];

    row['downloads'] = parseInt(row['New downloads'] || "0", 10);
    row['re_downloads'] = parseInt(row['Total downloads'] || "0", 10) - parseInt(row['New downloads'] || "0", 10) - parseInt(row['Successful updates'] || "0", 10);
    delete row['Total downloads'];
    delete row['New downloads'];

    row['uninstalls'] = parseInt(row['Uninstalls'] || "0", 10);
    delete row['Uninstalls'];

    row['updates'] = parseInt(row['Successful updates'] || "0", 10);
    delete row['Successful updates'];
  }
  return row;
};

const insertSalesData = async (allData, dateObj) => {
  const dateWith = fmt(dateObj, true);
  const dateWithout = fmt(dateObj, false);
  const tableName = `sales_${dateWithout}`;
  if (!huaweiToken) huaweiToken = await huaweiAPItoken();

  // Fetch Huawei data for the current day
  let huaweiData = await huaweiAPIdata(dateObj, huaweiToken);

  const apiData = allData[dateWith];
  if (!apiData) {
    console.log(styleText('red', `${dateWith} is not available in the API.`));
    return;
  }

  // Clean and filter
  let aosData = Object.values(apiData['334364831192'] || {})
    .map(item => clean(item, 'Android'))
    .filter(item => metricKeys.some(k => item[k]));
  let iosData = Object.values(apiData['334364831261'] || {})
    .map(item => clean(item, 'iOS'))
    .filter(item => metricKeys.some(k => item[k]));
  let huaweiRows = (huaweiData || [])
    .map(item => {
      const cleaned = clean(item, 'Huawei');
      cleaned.date = dateWith;
      return cleaned;
    })
    .filter(item => metricKeys.some(k => item[k]));
  const data = [...aosData, ...iosData, ...huaweiRows];

  if (data.length === 0) {
    console.log(styleText('yellow', `No insert needed for ${tableName}: no data.`));
    return;
  }

  const needsTable = !(await tableExists(datasetId, tableName));
  if (needsTable) {
    await createTable(datasetId, tableName, schema);
    console.log(styleText('green', `Table ${tableName} created with schema.`));
  } else {
    console.log(styleText('yellow', `Table ${tableName} exists.`));
  }

  const bqQuery = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', date) AS date,
      downloads, re_downloads, uninstalls, updates,
      platform, country
    FROM \`wkcda-districtapp.${tableName}\`
  `;
  const bqRows = needsTable ? [] : await bqData(datasetId, tableName, bqQuery);

  // INSERT IF NEEDED
  if (!checkMatchingItems(data, bqRows)) {
    if (bqRows.length > 0) await clearBQData(datasetId, tableName);
    await loadDataToBQ(data, datasetId, tableName, schema);
    console.log(styleText('yellow', `Loaded new data to ${tableName}`));
  } else {
    const metricsType = tableName.split('_')[0];
    console.log(styleText('yellow', `${metricsType} data for ${dateWith} is unchanged. Skipping load.`));
  }
};

// Utility to generate array of dates (no mutation issues)
function getDateRangeArray(start, end) {
  const arr = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    arr.push(new Date(d));
  }
  return arr;
}

// Parallel processing utility (throttle)
async function runInBatches(items, fn, batchSize) {
  let idx = 0;
  while (idx < items.length) {
    const batch = items.slice(idx, idx + batchSize);
    await Promise.all(batch.map(fn));
    idx += batchSize;
  }
}

// Efficient main processor
const processSalesAPI = async (startDate, endDate, api) => {
  const allData = await getDataFromAPI(startDate, endDate, api);
  const dateArray = getDateRangeArray(startDate, endDate);

  await runInBatches(
    dateArray,
    async d => {
      try {
        await insertSalesData(allData, d);
      } catch (e) {
        console.error(styleText('red', `Failed ${fmt(d, true)}: ${e.message}\n`));
      }
    },
    MAX_PARALLEL
  );
  return true;
};

export { processSalesAPI };