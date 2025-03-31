import axios from 'axios';
import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { styleText } from 'node:util';
import https from 'https';
import csvtojson from 'csvtojson';

// Reuse the BigQuery instance across functions
const bigquery = new BigQuery();

const fmt = (d, hyphen = false) =>
  hyphen
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
    : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}`;

const getDataFromAPI = async (start, end, api) => {
  const username = 'analytics@wkcda.hk',
    password = 'ACandy2235';
  const auth =
    'Basic ' +
    Buffer.from(`${username}:${password}`).toString('base64');
  const report = new URL(api).pathname.split('/').pop();

  console.log(
    `Getting data from ${fmt(start, true)} to ${fmt(end, true)} from Appfigures ${report} API`
  );
  try {
    const response = await axios.get(api, {
      headers: { Authorization: auth }
    });
    return response.data;
  } catch (error) {
    console.error(styleText('red', 'Error fetching data from API:', error));
    return null;
  }
};

const bqData = async (datasetId, tableId, query) => {
  const table = bigquery.dataset(datasetId).table(tableId);
  const metricsData = tableId.split('_')[0];
  console.log(`Returning ${metricsData} data from BigQuery`);
  try {
    const [metadata] = await table.getMetadata();
    if (!metadata.schema) return {};
    const options = { query};
    const [results] = await bigquery.query(options);
    return results;
  } catch (err) {
    console.error('bqData() ERROR:', err);
    throw err;
  }
};

const createTable = async (ds, tbl, schema) => {
  console.log(`Creating table ${tbl}.`);
  try {
    await bigquery.dataset(ds).createTable(tbl, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      location: 'asia-east2',
      schema: schema
    });
  } catch (err) {
    console.error(styleText('red', `Error creating table ${tbl}:`, err));
    throw err;
  }
};

const checkMatchingItems = (apiArr, bqArr) => {
  // If there are API items but no corresponding BigQuery items, return false.
  if (apiArr.length > 0 && (!Array.isArray(bqArr) || bqArr.length === 0)) {
    return false;
  }
  for (const item of apiArr) {
    if (!bqArr.some(bqItem => deepEqual(bqItem, item))) {
      return false; // Return false if a non-matching item is found
    }
  }
  return true; // Return true if every API item has a match in BigQuery
};

// A simple deep equality function
const deepEqual = (obj1, obj2) => {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

  const keys1 = Object.keys(obj1),
    keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) return false;
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
  }
  return true;
};

const loadDataToBQ = async (data, datasetId, tbl, schema) => {
  console.log(`Loading data to ${tbl}`);

  const tempFile = path.join(os.tmpdir(), `data_${tbl}.json`);
  const ndjson = data.map(item => JSON.stringify(item)).join(`\n`);
  
  fs.writeFileSync(tempFile, ndjson);

  try {
    await bigquery.dataset(datasetId).table(tbl).load(tempFile, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      location: 'asia-east2',
      schema: schema
    });
    console.log(styleText('green', `Successfully loaded data into ${tbl}`));
  } catch (error) {
    console.error(styleText('red', `Error loading data: ${error.stack || error}`));
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch (unlinkError) {
      console.error(styleText('red', `Error deleting temporary file: ${unlinkError.stack || unlinkError}`));
    }
  }
};

const tableExists = async (ds, tbl) => {
  try {
    const [tables] = await bigquery.dataset(ds).getTables();
    return tables.some(table => table.id === tbl);
  } catch (error) {
    console.error(styleText('red', `Error checking if table ${tbl} exists:`, error));
    throw error;
  }
};

const clearBQData = async (datasetId, tableId) => {
  const query = `
    TRUNCATE TABLE \`wkcda-districtapp.${datasetId}.${tableId}\`
  `;
  const options = { query };
  try {
    await bigquery.query(options);
  } catch (e) {
    console.error(styleText('red', 'clearBQData() ERROR:', e));
    throw e;
  }
};

// Helper to convert specified keys to numbers
const convertKeysToFloat = (obj, keys) => {
  keys.forEach(key => {
    if (typeof obj[key] === 'string') {
      const num = parseFloat(obj[key]);
      // Store as a float (or, if you need a fixed decimal string, use num.toFixed(2))
      obj[key] = !isNaN(num) ? num : obj[key];
    }
  });
  return obj;
};

const huaweiAPItoken = async () => {
  const getTokenBody = JSON.stringify({
    "grant_type": "client_credentials",
    "client_id": "1644992515062896576",
    "client_secret": "DF6E06CDCE683A33E3DF00B5958FD235BE4FC33304B3D536ADA4539CA8781C29"
  });

  const getTokenConfig = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://connect-api.cloud.huawei.com/api/oauth2/v1/token',
    headers: {
      'Content-Type': 'application/json'
    },
    data: getTokenBody
  };

  console.log(`Getting huawei token...`);

  try {
    const response = await axios.request(getTokenConfig);
    return response.data.access_token;
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

const huaweiAPIdata = async (date, token) => {
  let dataFilePath;
  const getDownloadConfig = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `https://connect-api.cloud.huawei.com/api/report/distribution-operation-quality/v1/appDownloadExport/108854063?language=en-US&groupBy=countryId&startTime=${fmt(date, false)}&endTime=${fmt(date, false)}`,
    headers: {
      'client_id': '1644992515062896576',
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await axios.request(getDownloadConfig);
    console.log(`Getting ${fmt(date, true)} huawei data from API...`);
    
    dataFilePath = response.data.fileURL;
  } catch (error) {
    console.log(error);
    throw new Error('Failed to get download URL from Huawei API.');
  }

  if (!dataFilePath) {
    throw new Error('Data file URL not found in the API response.');
  }

  return new Promise((resolve, reject) => {
    https.get(dataFilePath, (response) => {
      let csvData = '';
      response.on('data', (chunk) => {
        csvData += chunk;
      });
      response.on('end', () => {
        csvtojson()
          .fromString(csvData.trim())
          .then((jsonObj) => {
            resolve(jsonObj);
          })
          .catch((error) => {
            reject(error);
          });
      });
    }).on('error', (error) => {
      reject(`Error downloading the CSV file: ${error.message}`);
    });
  });
};

export { fmt, getDataFromAPI, bqData, createTable, checkMatchingItems, loadDataToBQ, clearBQData, tableExists, convertKeysToFloat, huaweiAPItoken, huaweiAPIdata };