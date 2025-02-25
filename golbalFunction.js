import axios from 'axios';
import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import os from 'os';
import path from 'path';

const fmt = (d, hyphen = false) =>
    hyphen
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

const getDataFromAPI = async (s, e, api) => {
    const username = 'analytics@wkcda.hk', password = 'ACandy2235', datasetId = "appfigures";
    const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    const report = new URL(api).pathname.split('/').pop();
    
    try {
        console.log(`Getting data from ${fmt(s, true)} to ${fmt(e, true)} from the Appfigures ${report} API`);
        const response = await axios.get(api, { headers: { Authorization: auth } });
        return response.data;
    } catch (error) {
        console.error('Error fetching data from API:', error);
        return null;
    }
};

const bqData = async (platform, datasetId, tableId, query) => {
    const bigquery = new BigQuery({ projectId: "wkcda-districtapp" });
    const table = bigquery.dataset(datasetId).table(tableId);
    console.log(`Returning ${platform} data from BigQuery`);

    const [metadata] = await table.getMetadata();

    if (!metadata.schema) {
        return {};
    }
    try {
        const options = { query, params: { platform } };
        const [results] = await bigquery.query(options);
        return results;
    } catch (err) {
        console.error('bqData() ERROR:', err);
        throw err;
    }
};

const createTable = async (ds, tbl) => {
    const bigquery = new BigQuery({ projectId: "wkcda-districtapp" });
    console.log(`Checking table ${tbl} exist or not.`);
    const exist = (await bigquery.dataset(ds).getTables())[0].some(table => table.id === tbl);

    if (!exist) {
        (await bigquery.dataset(ds).createTable(tbl, {
            sourceFormat: 'NEWLINE_DELIMITED_JSON',
            location: 'asia-east2',
            autodetect: true
        }));
        exist === true;
    }
    return exist;
}

const deepEqual = (obj1, obj2) => {
    if (obj1 === obj2) return true;
    if (obj1 == null || obj2 == null) return false;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
    }
    return true;
}

const loadDataToBQ = async (d, data, datasetId, tbl) => {
    const bigquery = new BigQuery({ projectId: "wkcda-districtapp" });
    const tempFile = path.join(os.tmpdir(), `data_${fmt(d, true)}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(data));
    console.log(`Loading ${data.platform} data to ${tbl}`);

    await bigquery
        .dataset(datasetId)
        .table(tbl)
        .load(tempFile, {
            sourceFormat: 'NEWLINE_DELIMITED_JSON',
            autodetect: true
        });
}

const clearBQData = async (platform, datasetId, tableId) => {
    const bigquery = new BigQuery({ projectId: "wkcda-districtapp" });
    const table = bigquery.dataset(datasetId).table(tableId);

    if (await table.get()) {
        const query = `
            DELETE FROM \`wkcda-districtapp.${datasetId}.${tableId}\`
            WHERE platform = @platform
        `;
        const options = {
            query,
            params: {
                platform
            }
        };
        try {
            await bigquery.query(options);
        } catch (e) {
            console.error('clearBQData() ERROR:', e);
            throw e;
        }
    }
};

export { fmt, getDataFromAPI, bqData, createTable, deepEqual, loadDataToBQ, clearBQData };