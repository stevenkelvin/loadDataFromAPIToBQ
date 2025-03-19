import { fmt, getDataFromAPI, bqData, createTable, removeDuplicates, loadDataToBQ, clearBQData, tableExists } from './golbalFunction.js';
import { styleText } from 'node:util';

const datasetId = "appfigures";

const clean = (row, p) => {
  row.platform = p;
  ['returns', 'net_downloads', 'promos', 'revenue', 'returns_amount', 'edu_downloads', 'gifts', 'gift_redemptions', 'edu_revenue', 'gross_revenue', 'gross_returns_amount', 'gross_edu_revenue', 'business_downloads', 'business_revenue', 'gross_business_revenue', 'standard_downloads', 'standard_revenue', 'gross_standard_revenue', 'app_downloads', 'app_returns', 'iap_amount', 'iap_returns', 'subscription_purchases', 'subscription_returns', 'app_revenue', 'app_returns_amount', 'gross_app_revenue', 'gross_app_returns_amount', 'iap_revenue', 'iap_returns_amount', 'gross_iap_revenue', 'gross_iap_returns_amount', 'subscription_revenue', 'subscription_returns_amount', 'gross_subscription_revenue', 'gross_subscription_returns_amount', 'pre_orders', 'product_id'].forEach(prop => delete row[prop]);
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
    { name: 'iso', type: 'STRING' },
    { name: 'country', type: 'STRING' }
  ],
};

const insertSalesData = async (allData, d) => {
  const dateWith = fmt(d, true);
  const dateWithout = fmt(d, false);
  const tbl = `sales_${dateWithout}`;
  let aosData, iosData, aosBqReturn = [], iosBqReturn = [];
  let dataLoaded = false;

  const salesQuery = `
      SELECT
        FORMAT_DATE('%Y-%m-%d', date) AS date,
        downloads,
        re_downloads,
        uninstalls,
        updates,
        platform,
        iso,
        country
    FROM \`wkcda-districtapp.appfigures.${tbl}\`
    WHERE platform = @platform
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

    if (!await tableExists(datasetId, tbl)) {
      if (aosData.length > 0 || iosData.length > 0) {
        // With a brand new table, load all API data right away
        await createTable(datasetId, tbl, schema);
        console.log(styleText('green', `Table ${tbl} created with schema.`));
      }
    } else {
      console.log(styleText('yellow', `Table ${tbl} exists.`));
      aosBqReturn = await bqData('Android', datasetId, tbl, salesQuery);
      iosBqReturn = await bqData('iOS', datasetId, tbl, salesQuery);
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

const processSalesAPI = async (start, end, api) => {
  const allData = await getDataFromAPI(start, end, api);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    try {
      const result = await insertSalesData(allData, d);
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
export { processSalesAPI };