import axios from 'axios';
import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { styleText } from 'node:util';

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

const bqData = async (plat, datasetId, tableId, query) => {
  const table = bigquery.dataset(datasetId).table(tableId);
  const metricsData = tableId.split('_')[0];
  console.log(`Returning ${plat} ${metricsData} data from BigQuery`);
  try {
    const [metadata] = await table.getMetadata();
    if (!metadata.schema) return {};
    const options = { query, params: { platform: plat } };
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

// Remove duplicates from API data array using deepEqual comparison
const removeDuplicates = (apiArr, bqObj) => {
  if (bqObj && Object.keys(bqObj).length > 0) {
    // For each data item in apiArr, remove it if it deep equals any value in bqObj
    return apiArr.filter(item =>
      !Object.values(bqObj).some(bqItem => deepEqual(bqItem, item))
    );
  }
  return apiArr;
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

const loadDataToBQ = async (d, data, datasetId, tbl, schema) => {
  console.log(`Loading ${data[0]?.platform} data to ${tbl}`);

  const tempFile = path.join(os.tmpdir(), `data_${tbl}_${data[0]?.platform}.json`);
  const ndjson = data.map(item => JSON.stringify(item)).join(`\n`);
  
  fs.writeFileSync(tempFile, ndjson);

  try {
    await bigquery.dataset(datasetId).table(tbl).load(tempFile, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      location: 'asia-east2',
      schema: schema
    });
    console.log(styleText('green', `Successfully loaded ${data[0]?.platform} data into ${tbl}`));
  } catch (error) {
    console.error(styleText('red', 'Error loading data:', error));
  } finally {
    fs.unlinkSync(tempFile);
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

const clearBQData = async (platform, country, datasetId, tableId) => {
  const query = `
    DELETE FROM \`wkcda-districtapp.${datasetId}.${tableId}\`
    WHERE platform = @platform AND country = @country
  `;
  const options = { query, params: { platform, country } };
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

export { fmt, getDataFromAPI, bqData, createTable, deepEqual, removeDuplicates, loadDataToBQ, clearBQData, tableExists, convertKeysToFloat };