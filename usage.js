import { fmt, getDataFromAPI, bqData, createTable, removeDuplicates, loadDataToBQ, clearBQData, tableExists, convertKeysToFloat } from './golbalFunction.js';
import { styleText } from 'node:util';

const datasetId = "appfigures";

const clean = (row, platform) => {
  row.platform = platform;
  ['storefront', 'store', 'product_id', 'crashes', 'screen_views'].forEach(prop => delete row[prop]);
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
    { name: 'iso', type: 'STRING' },
    { name: 'country', type: 'STRING' }
  ]
};

const insertFirebaseData = async (allData, d) => {
  const dateWith = fmt(d, true);
  const dateWithout = fmt(d, false);
  const tbl = `usage_${dateWithout}`;
  let aosData, iosData, aosBqReturn = [], iosBqReturn = [];
  let dataLoaded = false;

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
      iso,
      country
    FROM \`wkcda-districtapp.appfigures.${tbl}\`
    WHERE platform = @platform
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

    // First, check if the table exists
    if (!await tableExists(datasetId, tbl)) {
      if (aosData.length > 0 || iosData.length > 0) {
        // Create the table with the provided schema
        await createTable(datasetId, tbl, schema);
        console.log(styleText('green', `Table ${tbl} created with schema.`));
      }
    } else {
      console.log(styleText('yellow', `Table ${tbl} exists.`));
      aosBqReturn = await bqData('Android', datasetId, tbl, firebaseQuery);
      iosBqReturn = await bqData('iOS', datasetId, tbl, firebaseQuery);
    }
    const aosNewData = removeDuplicates(aosData, aosBqReturn);
    const iosNewData = removeDuplicates(iosData, iosBqReturn);

    const checkAndLoad = async (platform, bqReturn, newData) => {
      if (newData.length > 0) {
        if (bqReturn.length > 0) {
          // Clear BQ data for the countries represented in newData
          await Promise.all(newData.map(async item => {
            await clearBQData(platform, item.country, datasetId, tbl);
          }));
        }
        await loadDataToBQ(d, newData, datasetId, tbl, schema);

        console.log(styleText('yellow', `Loaded new ${platform} data to ${tbl}`));
        dataLoaded = true;
      } else {
        const metricsData = tbl.split('_')[0];
        console.log(styleText('yellow', `${platform} ${metricsData} data for ${dateWith} is unchanged. Skipping load.`));
      }
    };

    await Promise.all(['Android', 'iOS'].map(async platform => {
      const data = platform === 'Android' ? aosNewData : iosNewData;
      const bqReturn = platform === 'Android' ? aosBqReturn : iosBqReturn;
      if (data.length > 0) {
        await checkAndLoad(platform, bqReturn, data);
      }
    }));
  } else {
    console.log(styleText('red', `${d} is not available in the API.`));
  }
  return { tbl, dataLoaded };
};
const processFirebaseData = async (start, end, api) => {
  const allData = await getDataFromAPI(start, end, api);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    try {
      const result = await insertFirebaseData(allData, d);
      const { tbl, dataLoaded } = result;
      if (dataLoaded) {
        console.log(styleText('yellow', `Data loaded to ${datasetId}.${tbl}\n`));
      } else {
        console.log(styleText('yellow', `No changes for ${tbl}\n`));
      }
    } catch (e) {
      console.error(styleText('red', `Failed ${fmt(d, true)}: ${e.message}\n`));
    }
  }
  return true;
};
export { processFirebaseData };