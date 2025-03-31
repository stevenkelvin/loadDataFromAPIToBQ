import { fmt, getDataFromAPI, bqData, createTable, checkMatchingItems, loadDataToBQ, clearBQData, tableExists, huaweiAPItoken, huaweiAPIdata } from './golbalFunction.js';
import { styleText } from 'node:util';

const datasetId = "appfigures";

let huaweiToken;

const clean = (row, p) => {
  row.platform = p;
  if (p === 'iOS' || p === 'Android') {
    ['returns', 'net_downloads', 'promos', 'revenue', 'returns_amount', 'edu_downloads', 'gifts', 'gift_redemptions', 'edu_revenue', 'gross_revenue', 'gross_returns_amount', 'gross_edu_revenue', 'business_downloads', 'business_revenue', 'gross_business_revenue', 'standard_downloads', 'standard_revenue', 'gross_standard_revenue', 'app_downloads', 'app_returns', 'iap_amount', 'iap_returns', 'subscription_purchases', 'subscription_returns', 'app_revenue', 'app_returns_amount', 'gross_app_revenue', 'gross_app_returns_amount', 'iap_revenue', 'iap_returns_amount', 'gross_iap_revenue', 'gross_iap_returns_amount', 'subscription_revenue', 'subscription_returns_amount', 'gross_subscription_revenue', 'gross_subscription_returns_amount', 'pre_orders', 'product_id', 'iso'].forEach(prop => delete row[prop]);
  }
  else if (p === 'Huawei') {
    ['Valid impressions', 'Details UV (reported by client)', 'Valid impression CTR', 'Details page conversion rate', 'Successful installs', 'Installation success rate', 'Sharings', 'Icon clicks', 'New installs', 'Total uninstalls'].forEach(prop => delete row[prop]);
    row['Country/Region'] = row['Country/Region'].replace('Hong Kong(China)', 'Hong Kong').replace('Chinese mainland', 'China').replace('Macau(China)', 'Macao').replace('Taiwan(China)', 'Taiwan');
    row['country'] = row['Country/Region'];
    delete row['Country/Region'];

    row['downloads'] = parseInt(row['New downloads']);
    row['re_downloads'] = parseInt(row['Total downloads']) - parseInt(row['New downloads']);
    delete row['Total downloads'];
    delete row['New downloads'];

    row['uninstalls'] = parseInt(row['Uninstalls']);
    delete row['Uninstalls'];

    row['updates'] = parseInt(row['Successful updates']);
    delete row['Successful updates'];

  }
  return row;
};

const schema = {
  fields: [
    { name: 'date', type: 'DATE' },
    { name: 'platform', type: 'STRING' },
    { name: 'downloads', type: 'INTEGER' },
    { name: 're_downloads', type: 'INTEGER' },
    { name: 'uninstalls', type: 'INTEGER' },
    { name: 'updates', type: 'INTEGER' },
    { name: 'country', type: 'STRING' }
  ],
};

const insertSalesData = async (allData, d) => {
  const dateWith = fmt(d, true);
  const dateWithout = fmt(d, false);
  const tbl = `sales_${dateWithout}`;
  huaweiToken = (huaweiToken) ? huaweiToken : await huaweiAPItoken();
  let aosData, iosData, bqReturn = [], huaweiData = await huaweiAPIdata(d, huaweiToken);

  const salesQuery = `
      SELECT
        FORMAT_DATE('%Y-%m-%d', date) AS date,
        downloads,
        re_downloads,
        uninstalls,
        updates,
        platform,
        country
    FROM \`wkcda-districtapp.appfigures.${tbl}\`
  `;
  // Proceed to process API data if available for the date
  const apiData = allData[dateWith];
  if (apiData) {
    aosData = Object.values(apiData['334364831192']);
    iosData = Object.values(apiData['334364831261']);

    const metricKeys = [
      'downloads',
      're_downloads',
      'uninstalls',
      'updates'
    ];

    aosData = aosData
      .map(item => clean(item, 'Android'))
      .filter(item => !metricKeys.every(key => item[key] === 0));

    iosData = iosData
      .map(item => clean(item, 'iOS'))
      .filter(item => !metricKeys.every(key => item[key] === 0));

    huaweiData = huaweiData
      .map(item => {
        const cleaned = clean(item, 'Huawei');
        cleaned['date'] = fmt(new Date(d), true);
        return cleaned;
      })
      .filter(item => !metricKeys.every(key => item[key] === 0));

    const data = [...aosData, ...iosData, ...huaweiData];

    if (!await tableExists(datasetId, tbl)) {
      if (data.length > 0) {
        // With a brand new table, load all API data right away
        await createTable(datasetId, tbl, schema);
        console.log(styleText('green', `Table ${tbl} created with schema.`));
      }
    } else {
      console.log(styleText('yellow', `Table ${tbl} exists.`));
      bqReturn = await bqData(datasetId, tbl, salesQuery);
    }

    if (!checkMatchingItems(data, bqReturn)) {
      if (bqReturn.length > 0) {
        await clearBQData(datasetId, tbl);
      }
      await loadDataToBQ(data, datasetId, tbl, schema);

      console.log(styleText('yellow', `Loaded new data to ${tbl}`));
    } else {
      const metricsData = tbl.split('_')[0];
      console.log(styleText('yellow', `${metricsData} data for ${dateWith} is unchanged. Skipping load.`));
    }
  } else {
    console.log(styleText('red', `${d} is not available in the API.`));
  }
};

const processSalesAPI = async (start, end, api) => {
  const allData = await getDataFromAPI(start, end, api);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    try {
      await insertSalesData(allData, d);
    } catch (e) {
      console.error(styleText('red', `Failed ${fmt(d, true)}: ${e.message}\n`));
    }
  }
  return true;
};
export { processSalesAPI };