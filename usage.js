import { fmt, getDataFromAPI, bqData, createTable, checkMatchingItems, loadDataToBQ, clearBQData, tableExists, convertKeysToFloat } from './golbalFunction.js';
import { styleText } from 'node:util';

const datasetId = "appfigures";

const clean = (row, platform) => {
  row.platform = platform;
  ['storefront', 'store', 'product_id', 'crashes', 'screen_views', 'iso'].forEach(prop => delete row[prop]);
  return row;
};

const schema = {
  fields: [
    { name: 'date', type: 'DATE' },
    { name: 'platform', type: 'STRING' },
    { name: 'active_users', type: 'INTEGER' },
    { name: 'weekly_active_users', type: 'INTEGER' },
    { name: 'monthly_active_users', type: 'INTEGER' },
    { name: 'new_users', type: 'INTEGER' },
    { name: 'daily_total_users', type: 'INTEGER' },
    { name: 'sessions', type: 'INTEGER' },
    { name: 'engaged_sessions', type: 'INTEGER' },
    { name: 'session_duration', type: 'FLOAT' },
    { name: 'conversions', type: 'INTEGER' },
    { name: 'avg_daily_active_users', type: 'FLOAT' },
    { name: 'avg_session_duration', type: 'FLOAT' },
    { name: 'sessions_per_user', type: 'FLOAT' },
    { name: 'screen_views_per_user', type: 'FLOAT' },
    { name: 'engagement_rate', type: 'FLOAT' },
    { name: 'country', type: 'STRING' }
  ]
};

const insertFirebaseData = async (allData, d) => {
  const dateWith = fmt(d, true);
  const dateWithout = fmt(d, false);
  const tbl = `usage_${dateWithout}`;
  let aosData, iosData, bqReturn = [];

  // Build the query for fetching data per platform
  const firebaseQuery = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', date) AS date,
      platform,
      active_users,
      weekly_active_users,
      monthly_active_users,
      new_users,
      daily_total_users,
      sessions,
      engaged_sessions,
      session_duration,
      conversions,
      avg_daily_active_users,
      avg_session_duration,
      sessions_per_user,
      screen_views_per_user,
      engagement_rate,
      country
    FROM \`wkcda-districtapp.appfigures.${tbl}\`
  `;

  // Proceed to process API data if available for the date
  const apiData = allData[dateWith];

  if (apiData) {
    // Get raw API data for each platform and clean it
    aosData = Object.values(apiData['334364831192']);
    iosData = Object.values(apiData['334364831261']);

    const metricKeys = [
      'active_users',
      'weekly_active_users',
      'monthly_active_users',
      'new_users',
      'daily_total_users',
      'sessions',
      'engaged_sessions',
      'session_duration',
      'conversions',
      'avg_daily_active_users',
      'avg_session_duration',
      'sessions_per_user',
      'screen_views_per_user',
      'engagement_rate'
    ];

    aosData = aosData
      .map(item => clean(item, 'Android'))
      .filter(item => !metricKeys.every(key => item[key] === 0));

    iosData = iosData
      .map(item => clean(item, 'iOS'))
      .filter(item => !metricKeys.every(key => item[key] === 0));

    // Convert specific keys from string to float for consistency
    const keysToConvert = ['avg_daily_active_users', 'avg_session_duration', 'sessions_per_user', 'screen_views_per_user', 'engagement_rate'];
    aosData = aosData.map(item => convertKeysToFloat(item, keysToConvert));
    iosData = iosData.map(item => convertKeysToFloat(item, keysToConvert));

    const data = [...aosData, ...iosData];

    // First, check if the table exists
    if (!await tableExists(datasetId, tbl)) {
      if (data.length > 0) {
        // With a brand new table, load all API data right away
        await createTable(datasetId, tbl, schema);
        console.log(styleText('green', `Table ${tbl} created with schema.`));
      }
    } else {
      console.log(styleText('yellow', `Table ${tbl} exists.`));
      bqReturn = await bqData(datasetId, tbl, firebaseQuery);
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

const processFirebaseData = async (start, end, api) => {
  const allData = await getDataFromAPI(start, end, api);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    try {
      await insertFirebaseData(allData, d);
    } catch (e) {
      console.error(styleText('red', `Failed ${fmt(d, true)}: ${e.message}\n`));
    }
  }
  return true;
};
export { processFirebaseData };