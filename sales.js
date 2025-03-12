import { fmt, getDataFromAPI, bqData, createTable, deepEqual, loadDataToBQ, clearBQData } from './golbalFunction.js';

const datasetId = "appfigures";

const clean = (row, p) => {
  row.platform = p;
  ['returns', 'net_downloads', 'promos', 'revenue', 'returns_amount', 'edu_downloads', 'gifts', 'gift_redemptions', 'edu_revenue', 'gross_revenue', 'gross_returns_amount', 'gross_edu_revenue', 'business_downloads', 'business_revenue', 'gross_business_revenue', 'standard_downloads', 'standard_revenue', 'gross_standard_revenue', 'app_downloads', 'app_returns', 'iap_amount', 'iap_returns', 'subscription_purchases', 'subscription_returns', 'app_revenue', 'app_returns_amount', 'gross_app_revenue', 'gross_app_returns_amount', 'iap_revenue', 'iap_returns_amount', 'gross_iap_revenue', 'gross_iap_returns_amount', 'subscription_revenue', 'subscription_returns_amount', 'gross_subscription_revenue', 'gross_subscription_returns_amount', 'pre_orders', 'product_id'].forEach(prop => delete row[prop]);
};

const insertFirbaseData = async (allData, d) => {
  const dateWith = fmt(d, true);
  const dateWithout = fmt(d, false);
  const tbl = `sales_${dateWithout}`;
  let aosBqReturn, iosBqReturn, aos, ios; // declare outside so they're accessible everywhere
  let dataLoaded = false;

  const performanceQuery = `
      SELECT
        FORMAT_DATE('%Y-%m-%d', date) AS date,
        downloads,
        re_downloads,
        uninstalls,
        updates,
        platform
    FROM \`wkcda-districtapp.appfigures.${tbl}\`
    WHERE platform = @platform
`;

  if (await createTable(datasetId, tbl)) {
    console.log(`Table ${tbl} exists.`);

    const apiData = allData[dateWith];
    if (apiData) {
      aos = apiData['334364831192'];
      ios = apiData['334364831261'];

      clean(aos, 'Android');
      clean(ios, 'iOS');

      aosBqReturn = await bqData('Android', datasetId, tbl, performanceQuery);
      aosBqReturn = (aosBqReturn[0] == []) ? aosBqReturn : aosBqReturn[0];
      iosBqReturn = await bqData('iOS', datasetId, tbl, performanceQuery);
      iosBqReturn = (iosBqReturn[0] == []) ? iosBqReturn : iosBqReturn[0]

      const checkAndLoad = async (platform, bqReturn, data) => {
        if (!deepEqual(bqReturn, data)) {
          if (bqReturn) await clearBQData(platform, datasetId, tbl);
          await loadDataToBQ(d, data, datasetId, tbl);
          dataLoaded = true;
        } else {
          let metricsData = tbl.split('_')[0];
          console.log(`${platform} ${metricsData} data for ${dateWith} is unchanged. Skipping load data to BigQuery.`);
        }
      }
      await checkAndLoad('Android', aosBqReturn, aos);
      await checkAndLoad('iOS', iosBqReturn, ios);
    }
    else console.log(`${d} is not available in the API.`);
  }
  return { tbl: tbl, dataLoaded: dataLoaded };
};

const processPerformanceData = async (start, end, api) => {
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
};

export { processPerformanceData };