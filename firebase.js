import { fmt, getDataFromAPI, bqData, createTable, deepEqual, loadDataToBQ, clearBQData } from './golbalFunction.js';

const datasetId = "appfigures";

const clean = (row, p) => {
  row.platform = p;
  ['storefront', 'store', 'product_id', 'crashes', 'screen_views'].forEach(prop => delete row[prop]);
};

const insertFirbaseData = async (allData, d) => {
  const dateWith = fmt(d, true);
  const dateWithout = fmt(d, false);
  const tbl = `usage_${dateWithout}`;
  let aosBqReturn, iosBqReturn, aos, ios; // declare outside so they're accessible everywhere
  let dataLoaded = false;

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
        engagement_rate
    FROM \`wkcda-districtapp.appfigures.${tbl}\`
    WHERE platform = @platform
`;

  await createTable(datasetId, tbl);

  if (await createTable(datasetId, tbl)) {
    console.log(`Table ${tbl} exists.`);

    const apiData = allData[dateWith];
    if (apiData) {
      aos = apiData.firebase['334364831192'];
      ios = apiData.firebase['334364831261'];
      
      clean(aos, 'Android');
      clean(ios, 'iOS');

      aosBqReturn = await bqData('Android', datasetId, tbl, firebaseQuery);
      aosBqReturn = (aosBqReturn[0] == []) ? aosBqReturn : aosBqReturn[0];
      iosBqReturn = await bqData('iOS', datasetId, tbl, firebaseQuery);
      iosBqReturn = (iosBqReturn[0] == []) ? iosBqReturn : iosBqReturn[0];

      const keysToConvert = [
        'avg_daily_active_users',
        'avg_session_duration',
        'sessions_per_user',
        'screen_views_per_user',
        'engagement_rate'
      ];

      keysToConvert.forEach(key => {
        try {
          aos[key] = parseFloat(aos[key]).toFixed(2);
          ios[key] = parseFloat(ios[key]).toFixed(2);
          if (aosBqReturn) aosBqReturn[key] = parseFloat(aosBqReturn[key]).toFixed(2);
          if (iosBqReturn) iosBqReturn[key] = parseFloat(iosBqReturn[key]).toFixed(2);
        } catch (e) {
          console.log(e);
        }
      });

      const checkAndLoad = async (platform, bqReturn, data) => {
        if (!deepEqual(bqReturn, data)) {
          if (bqReturn) await clearBQData(platform, datasetId, tbl);
            await loadDataToBQ(d, data, datasetId, tbl);
            dataLoaded = true;
        } else {
          console.log(`${platform} data for ${dateWith} is unchanged. Skipping load data to BigQuery.`);
        }
      };88

      await checkAndLoad('Android', aosBqReturn, aos);
      await checkAndLoad('iOS', iosBqReturn, ios);
    }
    else console.log(`${d} is not available in the API.`);
  }
  return { tbl: tbl, dataLoaded: dataLoaded };
};

const processFirebaseData = async (start, end, api) => {
  // Call the API only once for the whole date range
  const allData = await getDataFromAPI(start, end, api);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    try {
      const result = await insertFirbaseData(allData, d);
      const tbl = result.tbl;
      const dataLoaded = result.dataLoaded;

      if (dataLoaded) {
        console.log(`Data loaded to ${datasetId}.${tbl} \n`);
      }
      else {
        console.log(`\n`);
      }
    } catch (e) {
      console.error(`Failed ${fmt(d, true)}: ${e.message} \n`);
    }
  }
  return true;
};

export { processFirebaseData };