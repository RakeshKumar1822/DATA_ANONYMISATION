import axios from 'axios';

const getApiBaseUrl = () => {
  let envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    envUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
    if (!envUrl.endsWith('/api')) {
      envUrl += '/api';
    }
    return envUrl;
  }
  return 'http://localhost:8000/api';
};

const API_BASE_URL = getApiBaseUrl();

export const uploadDataset = async (file, overrideName = null) => {
  const formData = new FormData();
  formData.append('file', file);
  let url = `${API_BASE_URL}/ingest/file`;
  if (overrideName) {
    url += `?override_name=${encodeURIComponent(overrideName)}`;
  }
  const response = await axios.post(url, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const fetchFromUrl = async (url, customDatasetName = null) => {
  const response = await axios.post(`${API_BASE_URL}/ingest/url`, { 
    url, 
    custom_dataset_name: customDatasetName 
  });
  return response.data;
};

export const fetchFromS3 = async (s3Config) => {
  const response = await axios.post(`${API_BASE_URL}/ingest/s3`, {
    bucket: s3Config.bucket,
    key: s3Config.key,
    region_name: s3Config.region || "us-east-1",
    aws_access_key_id: s3Config.accessKeyId || null,
    aws_secret_access_key: s3Config.secretAccessKey || null,
    custom_dataset_name: s3Config.customDatasetName || null
  });
  return response.data;
};

export const fetchS3Buckets = async (credentials) => {
  const response = await axios.post(`${API_BASE_URL}/ingest/s3/buckets`, {
    region_name: credentials.region || "us-east-1",
    aws_access_key_id: credentials.accessKeyId || credentials.aws_access_key_id || null,
    aws_secret_access_key: credentials.secretAccessKey || credentials.aws_secret_access_key || null
  });
  return response.data;
};

export const fetchS3Folders = async (bucketName, credentials) => {
  const response = await axios.post(`${API_BASE_URL}/ingest/s3/folders`, {
    bucket: bucketName,
    region_name: credentials.region || "us-east-1",
    aws_access_key_id: credentials.accessKeyId || credentials.aws_access_key_id || null,
    aws_secret_access_key: credentials.secretAccessKey || credentials.aws_secret_access_key || null
  });
  return response.data;
};

export const fetchS3Objects = async (bucketName, prefix = "", credentials) => {
  const response = await axios.post(`${API_BASE_URL}/ingest/s3/objects`, {
    bucket: bucketName,
    prefix: prefix,
    region_name: credentials.region || "us-east-1",
    aws_access_key_id: credentials.accessKeyId || null,
    aws_secret_access_key: credentials.secretAccessKey || null
  });
  return response.data;
};

export const exportToS3 = async (exportConfig) => {
  const response = await axios.post(`${API_BASE_URL}/export/s3`, {
    dataset_name: exportConfig.datasetName,
    bucket: exportConfig.bucket,
    destination_key: exportConfig.destinationKey,
    format: exportConfig.format || "csv",
    region_name: exportConfig.region || "us-east-1",
    aws_access_key_id: exportConfig.accessKeyId || null,
    aws_secret_access_key: exportConfig.secretAccessKey || null,
    rules: exportConfig.rules || {},
    seed: 2026
  });
  return response.data;
};

export const connectMySQLDatabases = async (config) => {
  const response = await axios.post(`${API_BASE_URL}/connect/mysql/databases`, config);
  return response.data;
};

export const fetchMySQLTables = async (config) => {
  const response = await axios.post(`${API_BASE_URL}/connect/mysql/tables`, config);
  return response.data;
};

export const importMySQLTable = async (config, targetName) => {
  const response = await axios.post(`${API_BASE_URL}/connect/mysql/import`, {
    ...config,
    driver: "mysql",
    custom_dataset_name: targetName
  });
  return response.data;
};

export const exportToMySQL = async (exportConfig) => {
  const response = await axios.post(`${API_BASE_URL}/export/mysql`, {
    host: exportConfig.host || "localhost",
    port: exportConfig.port || 3306,
    user: exportConfig.user,
    password: exportConfig.password,
    database: exportConfig.database || "test_db",
    tableName: exportConfig.tableName,
    dataset_name: exportConfig.datasetName,
    rules: exportConfig.rules || {},
    dataframe_dicts: exportConfig.dataframeDicts
  });
  return response.data;
};

export const connectSnowflakeDatabases = async (config) => {
  const response = await axios.post(`${API_BASE_URL}/connect/snowflake/databases`, config);
  return response.data;
};

export const fetchSnowflakeSchemas = async (config) => {
  const response = await axios.post(`${API_BASE_URL}/connect/snowflake/schemas`, config);
  return response.data;
};

export const fetchSnowflakeTables = async (config) => {
  const response = await axios.post(`${API_BASE_URL}/connect/snowflake/tables`, config);
  return response.data;
};

export const importSnowflakeTable = async (config) => {
  const response = await axios.post(`${API_BASE_URL}/connect/snowflake/import`, config);
  return response.data;
};

export const exportToSnowflake = async (exportConfig) => {
  const response = await axios.post(`${API_BASE_URL}/connect/snowflake/import`, {
    driver: "snowflake",
    account: exportConfig.account,
    user: exportConfig.user,
    password: exportConfig.password,
    database: exportConfig.database || "TEST_DATA_DB",
    schema: exportConfig.schema || "EXTERNAL_FILES",
    warehouse: exportConfig.warehouse,
    role: exportConfig.role,
    table: exportConfig.tableName,
    action: "extract_test_db",
    force_external_schema: exportConfig.forceExternalSchema || false,
    dataframe_dicts: exportConfig.dataframeDicts
  });
  return response.data;
};

export const connectPostgresDatabases = async (config) => {
  const response = await axios.post(`${API_BASE_URL}/connect/postgres/databases`, {
    ...config,
    driver: "postgresql"
  });
  return response.data;
};

export const fetchPostgresSchemas = async (config) => {
  const response = await axios.post(`${API_BASE_URL}/connect/postgres/schemas`, {
    ...config,
    driver: "postgresql"
  });
  return response.data;
};

export const fetchPostgresTables = async (config) => {
  const response = await axios.post(`${API_BASE_URL}/connect/postgres/tables`, {
    ...config,
    driver: "postgresql"
  });
  return response.data;
};

export const importPostgresTable = async (config, targetName) => {
  const response = await axios.post(`${API_BASE_URL}/connect/postgres/import`, {
    ...config,
    driver: "postgresql",
    custom_dataset_name: targetName
  });
  return response.data;
};

export const exportToPostgres = async (exportConfig) => {
  const response = await axios.post(`${API_BASE_URL}/export/postgres`, {
    host: exportConfig.host || "localhost",
    port: exportConfig.port || 5432,
    user: exportConfig.user,
    password: exportConfig.password,
    database: exportConfig.database || "test_db",
    schema: exportConfig.schema || "public",
    tableName: exportConfig.tableName,
    dataset_name: exportConfig.datasetName,
    rules: exportConfig.rules || {},
    dataframe_dicts: exportConfig.dataframeDicts,
    force_external_schema: exportConfig.forceExternalSchema || false
  });
  return response.data;
};

export const fetchDatasetPreview = async (datasetName, page = 1, limit = 100) => {
  const response = await axios.get(`${API_BASE_URL}/preview/${datasetName}`, {
    params: { page, limit },
  });
  return response.data;
};

export const fetchAnonymizedPreview = async (datasetName, rules, page = 1, limit = 100) => {
  const response = await axios.post(
    `${API_BASE_URL}/anonymize/preview`,
    { dataset_name: datasetName, rules },
    { params: { page, limit } }
  );
  return response.data;
};

export const downloadMultiDatasetPackage = async (datasetNames, rulesMap, format = 'csv', includeOriginal = false) => {
  const response = await axios.post(
    `${API_BASE_URL}/export/multi`,
    {
      dataset_names: datasetNames,
      rules_map: rulesMap,
      format,
      include_original: includeOriginal
    },
    { responseType: 'blob' }
  );
  
  const blob = new Blob([response.data], { type: 'application/zip' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'anonymized_datasets_package.zip');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};