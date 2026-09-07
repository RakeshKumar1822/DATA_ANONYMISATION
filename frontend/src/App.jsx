import React, { useState, useEffect } from 'react';
import {
  Button, Typography, CircularProgress, MenuItem, Select,
  FormControl, InputLabel, IconButton, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions, Checkbox, FormGroup, FormControlLabel, Box, Divider
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import StorageIcon from '@mui/icons-material/Storage';
import LinkIcon from '@mui/icons-material/Link';
import DownloadIcon from '@mui/icons-material/Download';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import CloudIcon from '@mui/icons-material/Cloud';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';

import {
  uploadDataset, fetchFromUrl, connectMySQLDatabases,
  fetchMySQLTables, importMySQLTable, fetchDatasetPreview,
  fetchAnonymizedPreview, downloadMultiDatasetPackage,
  connectSnowflakeDatabases, fetchSnowflakeSchemas, fetchSnowflakeTables,
  fetchFromS3, exportToS3, importSnowflakeTable, exportToSnowflake,
  connectPostgresDatabases, fetchPostgresSchemas, fetchPostgresTables,
  importPostgresTable, exportToPostgres, exportToMySQL,
  fetchS3Buckets, fetchS3Folders, fetchS3Objects
} from './services/api';
import DataPreviewTable from './components/DataPreviewTable';

const DEFAULT_RULE = { algo: "None", case: "Original Case", consistent: true, preserve_format: true, target_date_format: "%d-%m-%Y" };

export default function App() {
  const [activeDataset, setActiveDataset] = useState('');
  const [savedWorkspace, setSavedWorkspace] = useState(() => {
    try {
      const cached = localStorage.getItem('saved_workspaces');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });

  const [columns, setColumns] = useState([]);
  const [data, setData] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [loading, setLoading] = useState(false);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFullScreenTable, setIsFullScreenTable] = useState(false);
  const [isWorkspacesOpen, setIsWorkspacesOpen] = useState(true);
  const [isExecuted, setIsExecuted] = useState(false);

  const [rules, setRules] = useState({});
  const [isAnonymizedView, setIsAnonymizedView] = useState(false);

  const [dbPlatform, setDbPlatform] = useState(''); 
  const [mysqlCreds, setMysqlCreds] = useState({ host: 'localhost', port: 3306, user: 'root', password: '' });
  const [snowflakeCreds, setSnowflakeCreds] = useState({ account: '', user: '', password: '', warehouse: 'COMPUTE_WH', role: '' });
  const [postgresCreds, setPostgresCreds] = useState({ host: 'localhost', port: 5432, user: 'postgres', password: '' });

  const [dbConnected, setDbConnected] = useState(false);
  const [dbList, setDbList] = useState([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [schemaList, setSchemaList] = useState([]);
  const [selectedSchema, setSelectedSchema] = useState('');
  const [tableList, setTableList] = useState([]);
  const [selectedTables, setSelectedTables] = useState([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [s3Creds, setS3Creds] = useState({
    bucket: '',
    key: '',
    region: 'us-east-1',
    accessKeyId: '',
    secretAccessKey: ''
  });

  const [awsLoggedIn, setAwsLoggedIn] = useState(false);
  const [awsBuckets, setAwsBuckets] = useState([]);
  const [awsFolders, setAwsFolders] = useState([]);
  const [awsFiles, setAwsFiles] = useState([]);
  const [selectedAwsBucket, setSelectedAwsBucket] = useState('');
  const [selectedAwsFolder, setSelectedAwsFolder] = useState('');
  const [customFolderInput, setCustomFolderInput] = useState('');
  const [loadingAwsBuckets, setLoadingAwsBuckets] = useState(false);

  const [s3ExportCreds, setS3ExportCreds] = useState({
    bucket: '',
    destinationKey: '',
    region: 'us-east-1',
    accessKeyId: '',
    secretAccessKey: ''
  });

  const [activeIngestModal, setActiveIngestModal] = useState(null);

  const [duplicateModal, setDuplicateModal] = useState({ open: false, type: '', payload: null, existingName: '' });
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [homeModalOpen, setHomeModalOpen] = useState(false);
  const [selectedFilesToDownload, setSelectedFilesToDownload] = useState([]);
  const [downloadFormat, setDownloadFormat] = useState('csv');
  const [includeOriginalInDownload, setIncludeOriginalInDownload] = useState(false);

  const [extractionTarget, setExtractionTarget] = useState('snowflake');

  useEffect(() => {
    try {
      localStorage.setItem('saved_workspaces', JSON.stringify(savedWorkspace));
    } catch (e) {
      console.error("Failed to save workspace to localStorage", e);
    }
  }, [savedWorkspace]);

  const generateVersionedName = (baseName) => {
    let counter = 1;
    let newName = `${baseName}_${counter}`;
    while (savedWorkspace[newName]) {
      counter++;
      newName = `${baseName}_${counter}`;
    }
    return newName;
  };

  const resetIngestionInputs = () => {
    setUrlInput('');
    setDbPlatform('');
    setDbConnected(false);
    setDbList([]);
    setSelectedDb('');
    setSchemaList([]);
    setSelectedSchema('');
    setTableList([]);
    setSelectedTables([]);
    setS3Creds({
      bucket: '',
      key: '',
      region: 'us-east-1',
      accessKeyId: '',
      secretAccessKey: ''
    });
    setActiveIngestModal(null);
  };

  const handleDatasetLoaded = async (datasetName, cols, dbSource = null, schemaSource = null, tableSource = null) => {
    setActiveDataset(datasetName);
    setColumns(cols);

    const initRules = {};
    cols.forEach(c => {
      initRules[c] = { ...DEFAULT_RULE };
    });
    setRules(initRules);

    setSavedWorkspace(prev => ({ 
      ...prev, 
      [datasetName]: { 
        columns: cols, 
        originalDb: dbSource || selectedDb || "MY_DB",
        originalSchema: schemaSource || selectedSchema || "public",
        originalTable: tableSource || datasetName
      } 
    }));

    const previewRes = await fetchDatasetPreview(datasetName, 1, rowsPerPage);
    setData(previewRes.data);
    setTotalRows(previewRes.total_rows);
    setIsAnonymizedView(false);
    setIsExecuted(false);
    
    resetIngestionInputs();
  };

  const processFileUpload = async (file, overrideName = null) => {
    const rawName = overrideName || file.name.split('.')[0].replace(/ /g, '_');
    if (!overrideName && savedWorkspace[rawName]) {
      setDuplicateModal({ open: true, type: 'FILE', payload: file, existingName: rawName });
      return;
    }

    try {
      const res = await uploadDataset(file, overrideName);
      await handleDatasetLoaded(res.dataset_name, res.columns);
    } catch (err) {
      alert("Error uploading file: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setLoading(true);
    for (const file of files) {
      await processFileUpload(file);
    }
    setLoading(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    setLoading(true);
    for (const file of files) {
      await processFileUpload(file);
    }
    setLoading(false);
  };

  const processS3Fetch = async (config = s3Creds, overrideName = null) => {
    if (!config.bucket || !config.key) return;
    setLoading(true);
    try {
      const baseName = config.key.split('/').pop().split('.')[0];
      const targetName = overrideName || baseName;
      if (!overrideName && savedWorkspace[targetName]) {
        setLoading(false);
        setDuplicateModal({ open: true, type: 'S3', payload: config, existingName: targetName });
        return;
      }
      const res = await fetchFromS3({ ...config, customDatasetName: overrideName });

      setS3ExportCreds({
        bucket: config.bucket,
        destinationKey: config.key.substring(0, config.key.lastIndexOf('/') + 1) || '',
        region: config.region || 'us-east-1',
        accessKeyId: config.accessKeyId || '',
        secretAccessKey: config.secretAccessKey || ''
      });
      setAwsLoggedIn(true);

      await handleDatasetLoaded(res.dataset_name, res.columns, "AWS_S3", config.bucket, baseName);
    } catch (err) {
      alert("S3 Ingest Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleFetchAwsBuckets = async (credsToUse = s3Creds) => {
    setLoadingAwsBuckets(true);
    try {
      const res = await fetchS3Buckets({
        region: credsToUse.region || 'us-east-1',
        accessKeyId: credsToUse.accessKeyId,
        secretAccessKey: credsToUse.secretAccessKey
      });
      setAwsBuckets(res.buckets || []);
      setAwsLoggedIn(true);
    } catch (err) {
      alert("AWS Connection Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoadingAwsBuckets(false);
    }
  };

  const handleSelectAwsBucket = async (bucketName) => {
    setSelectedAwsBucket(bucketName);
    setSelectedAwsFolder('');
    setAwsFolders([]);
    if (!bucketName) return;

    try {
      const res = await fetchS3Folders(bucketName, {
        region: s3ExportCreds.region || s3Creds.region || 'us-east-1',
        accessKeyId: s3ExportCreds.accessKeyId || s3Creds.accessKeyId,
        secretAccessKey: s3ExportCreds.secretAccessKey || s3Creds.secretAccessKey
      });
      setAwsFolders(res.folders || []);
    } catch (err) {
      console.warn("Could not fetch S3 subfolders, defaulting to root.", err);
      setAwsFolders([]);
    }
  };

  const handleConnectDb = async () => {
    setLoading(true);
    try {
      setDbConnected(false);
      setDbList([]);
      setSelectedDb('');
      setSchemaList([]);
      setSelectedSchema('');
      setTableList([]);
      setSelectedTables([]);

      if (dbPlatform === 'MySQL') {
        const res = await connectMySQLDatabases(mysqlCreds);
        setDbList(res.databases);
        setDbConnected(true);
      } else if (dbPlatform === 'Snowflake') {
        const res = await connectSnowflakeDatabases(snowflakeCreds);
        setDbList(res.databases);
        setDbConnected(true);
      } else if (dbPlatform === 'PostgreSQL') {
        const res = await connectPostgresDatabases(postgresCreds);
        setDbList(res.databases);
        setDbConnected(true);
      } else {
        alert(`${dbPlatform} connector is currently not configured.`);
      }
    } catch (err) {
      alert("Connection Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDb = async (dbName) => {
    setSelectedDb(dbName);
    setSelectedSchema('');
    setSchemaList([]);
    setTableList([]);
    setSelectedTables([]);

    if (!dbName) return;

    if (dbPlatform === 'MySQL') {
      setLoading(true);
      try {
        const res = await fetchMySQLTables({ ...mysqlCreds, database: dbName });
        setTableList(res.tables || []);
      } catch (err) {
        alert("Error fetching MySQL tables: " + (err.response?.data?.detail || err.message));
      } finally {
        setLoading(false);
      }
    } else if (dbPlatform === 'Snowflake') {
      setLoadingSchemas(true);
      try {
        const res = await fetchSnowflakeSchemas({ ...snowflakeCreds, database: dbName });
        setSchemaList(res.schemas || []);
      } catch (err) {
        alert("Error fetching Snowflake schemas: " + (err.response?.data?.detail || err.message));
      } finally {
        setLoadingSchemas(false);
      }
    } else if (dbPlatform === 'PostgreSQL') {
      setLoadingSchemas(true);
      try {
        const res = await fetchPostgresSchemas({ ...postgresCreds, database: dbName });
        setSchemaList(res.schemas || ['public']);
      } catch (err) {
        alert("Error fetching PostgreSQL schemas: " + (err.response?.data?.detail || err.message));
      } finally {
        setLoadingSchemas(false);
      }
    }
  };

  const handleSelectSchema = async (schemaName) => {
    setSelectedSchema(schemaName);
    setTableList([]);
    setSelectedTables([]);

    if (!schemaName) return;

    setLoading(true);
    try {
      if (dbPlatform === 'Snowflake') {
        const res = await fetchSnowflakeTables({ ...snowflakeCreds, database: selectedDb, schema: schemaName });
        setTableList(res.tables || []);
      } else if (dbPlatform === 'PostgreSQL') {
        const res = await fetchPostgresTables({ ...postgresCreds, database: selectedDb, schema: schemaName });
        setTableList(res.tables || []);
      }
    } catch (err) {
      alert("Error fetching tables: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const processDbImport = async () => {
    if (selectedTables.length === 0) return;

    setLoadingImport(true);
    try {
      let lastLoadedName = '';
      let lastCols = [];
      for (const tbl of selectedTables) {
        const baseName = dbPlatform === 'Snowflake' || dbPlatform === 'PostgreSQL' 
          ? `${selectedDb}_${selectedSchema || 'public'}_${tbl}`.replace(/ /g, '_') 
          : `${selectedDb}_${tbl}`.replace(/ /g, '_');
        const targetName = savedWorkspace[baseName] ? generateVersionedName(baseName) : baseName;

        let res;
        if (dbPlatform === 'MySQL') {
          res = await importMySQLTable({ ...mysqlCreds, database: selectedDb, table: tbl }, targetName);
        } else if (dbPlatform === 'Snowflake') {
          res = await importSnowflakeTable({ ...snowflakeCreds, database: selectedDb, schema: selectedSchema, table: tbl }, targetName);
        } else if (dbPlatform === 'PostgreSQL') {
          res = await importPostgresTable({ ...postgresCreds, database: selectedDb, schema: selectedSchema || 'public', table: tbl }, targetName);
        }

        lastLoadedName = res.dataset_name;
        lastCols = res.columns;
        setSavedWorkspace(prev => ({ 
          ...prev, 
          [res.dataset_name]: { 
            columns: res.columns, 
            originalDb: `${dbPlatform}:${selectedDb}`, 
            originalSchema: selectedSchema || (dbPlatform === 'PostgreSQL' ? 'public' : 'PUBLIC'), 
            originalTable: tbl 
          } 
        }));
      }
      if (lastLoadedName) {
        await handleDatasetLoaded(lastLoadedName, lastCols, `${dbPlatform}:${selectedDb}`, selectedSchema || (dbPlatform === 'PostgreSQL' ? 'public' : 'PUBLIC'), selectedTables[0]);
      }
    } catch (err) {
      alert("Error importing tables: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoadingImport(false);
    }
  };

  const processUrlFetch = async (targetUrl = urlInput, overrideName = null) => {
    if (!targetUrl) return;
    setLoadingUrl(true);
    try {
      let cleanInput = targetUrl.trim();
      if (cleanInput.startsWith("file:///")) {
        cleanInput = cleanInput.replace("file:///", "").replace(/\//g, "\\");
      }

      const res = await fetchFromUrl(targetUrl, overrideName);
      if (!overrideName && savedWorkspace[res.dataset_name]) {
        setLoadingUrl(false);
        setDuplicateModal({ open: true, type: 'URL', payload: null, existingName: res.dataset_name });
        return;
      }
      await handleDatasetLoaded(res.dataset_name, res.columns, "LOCAL_URL", "public", res.dataset_name);
    } catch (err) {
      alert("URL / File Path Fetch Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoadingUrl(false);
    }
  };

  const handleUploadAtAnyCost = async () => {
    const versionedName = generateVersionedName(duplicateModal.existingName);
    const modalType = duplicateModal.type;
    const payload = duplicateModal.payload;
    setDuplicateModal({ open: false, type: '', payload: null, existingName: '' });

    if (modalType === 'FILE') await processFileUpload(payload, versionedName);
    else if (modalType === 'URL') await processUrlFetch(urlInput, versionedName);
    else if (modalType === 'S3') await processS3Fetch(payload, versionedName);
  };

  const handleSaveRule = (col, newRule) => {
    const updated = { ...rules, [col]: newRule };
    setRules(updated);
  };

  const hasConfiguredRules = Object.values(rules).some(r => r && r.algo && r.algo !== 'None');

  const applyAnonymization = async (activeRules = rules, targetPage = page, limit = rowsPerPage) => {
    setLoading(true);
    try {
      const res = await fetchAnonymizedPreview(activeDataset, activeRules, targetPage, limit);
      setData(res.data);
      setTotalRows(res.total_rows || totalRows);
      setIsAnonymizedView(true);
      setIsExecuted(true);
    } catch (err) {
      alert("Error running anonymization: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfig = async () => {
    const initRules = {};
    columns.forEach(c => { initRules[c] = { ...DEFAULT_RULE }; });
    setRules(initRules);
    setIsAnonymizedView(false);
    setIsExecuted(false);

    if (activeDataset) {
      setLoading(true);
      const previewRes = await fetchDatasetPreview(activeDataset, 1, rowsPerPage);
      setData(previewRes.data);
      setTotalRows(previewRes.total_rows);
      setLoading(false);
    }
  };

  const handleToggleView = async (isChecked) => {
    if (isChecked && isExecuted) {
      await applyAnonymization(rules, page, rowsPerPage);
    } else {
      setLoading(true);
      const previewRes = await fetchDatasetPreview(activeDataset, page, rowsPerPage);
      setData(previewRes.data);
      setTotalRows(previewRes.total_rows);
      setIsAnonymizedView(false);
      setLoading(false);
    }
  };

  const handlePageChange = async (newPage, newLimit = rowsPerPage) => {
    setPage(newPage);
    setRowsPerPage(newLimit);
    if (isAnonymizedView) {
      await applyAnonymization(rules, newPage, newLimit);
    } else {
      setLoading(true);
      const previewRes = await fetchDatasetPreview(activeDataset, newPage, newLimit);
      setData(previewRes.data);
      setTotalRows(previewRes.total_rows);
      setLoading(false);
    }
  };

  const handleDeleteDataset = (dsName) => {
    const updated = { ...savedWorkspace };
    delete updated[dsName];
    setSavedWorkspace(updated);
    if (activeDataset === dsName) {
      setActiveDataset('');
      setColumns([]);
      setData([]);
      setIsExecuted(false);
    }
  };

  const handleLocalDownload = async () => {
    try {
      const rulesMap = {};
      selectedFilesToDownload.forEach(ds => {
        rulesMap[ds] = rules;
      });
      await downloadMultiDatasetPackage(
        selectedFilesToDownload,
        rulesMap,
        downloadFormat,
        includeOriginalInDownload
      );
      setDownloadModalOpen(false);
    } catch (err) {
      alert("Download Error: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleConfirmMultiDownload = async () => {
    setExportModalOpen(false);

    if (extractionTarget === 'aws') {
      setLoading(true);
      try {
        for (const ds of selectedFilesToDownload) {
          const workspaceMeta = savedWorkspace[ds] || {};
          const targetBucket = selectedAwsBucket;
          const folderToUse = selectedAwsFolder;
          const folderClean = folderToUse && folderToUse !== '(Root)' ? `${folderToUse.replace(/\/$/, '')}/` : '';
          const targetKey = `${folderClean}${workspaceMeta.originalTable || ds}.${downloadFormat}`;
          
          await exportToS3({
            datasetName: ds,
            bucket: targetBucket,
            destinationKey: targetKey,
            format: downloadFormat,
            region: s3ExportCreds.region || 'us-east-1',
            accessKeyId: s3ExportCreds.accessKeyId || s3Creds.accessKeyId,
            secretAccessKey: s3ExportCreds.secretAccessKey || s3Creds.secretAccessKey,
            rules: rules || {}
          });
        }
        alert("Successfully exported anonymized data back to AWS S3!");
      } catch (err) {
        alert("AWS S3 Export Error: " + (err.response?.data?.detail || err.message));
      } finally {
        setLoading(false);
      }
    } else if (extractionTarget === 'snowflake') {
      setLoading(true);
      try {
        for (const dsName of selectedFilesToDownload) {
          const previewRes = await fetchAnonymizedPreview(dsName, rules, 1, 1000000);
          const workspaceMeta = savedWorkspace[dsName] || {};
          const isDbOrigin = workspaceMeta.originalDb && !workspaceMeta.originalDb.toLowerCase().includes("url") && !workspaceMeta.originalDb.toLowerCase().includes("file") && !workspaceMeta.originalDb.toLowerCase().includes("s3");

          if (!snowflakeCreds.account || !snowflakeCreds.user || !snowflakeCreds.password) {
            alert("Please provide your Snowflake credentials.");
            setLoading(false);
            return;
          }

          const schemaName = isDbOrigin ? (workspaceMeta.originalSchema || "PUBLIC") : "EXTERNAL_FILES";
          await exportToSnowflake({
            ...snowflakeCreds,
            database: "TEST_DATA_DB",
            schema: schemaName,
            tableName: workspaceMeta.originalTable || dsName,
            datasetName: dsName,
            rules: rules,
            dataframeDicts: previewRes.data,
            forceExternalSchema: !isDbOrigin
          });
        }
        alert("Successfully mirrored anonymized data into Snowflake under TEST_DATA_DB!");
      } catch (err) {
        alert("Snowflake Extraction Error: " + (err.response?.data?.detail || err.message));
      } finally {
        setLoading(false);
      }
    } else if (extractionTarget === 'postgres') {
      setLoading(true);
      try {
        for (const dsName of selectedFilesToDownload) {
          const previewRes = await fetchAnonymizedPreview(dsName, rules, 1, 1000000);
          const workspaceMeta = savedWorkspace[dsName] || {};
          const isDbOrigin = workspaceMeta.originalDb && !workspaceMeta.originalDb.toLowerCase().includes("url") && !workspaceMeta.originalDb.toLowerCase().includes("file") && !workspaceMeta.originalDb.toLowerCase().includes("s3");

          const schemaName = isDbOrigin ? (workspaceMeta.originalSchema || "public") : "external_files";
          await exportToPostgres({
            host: postgresCreds.host || "localhost",
            port: postgresCreds.port || 5432,
            user: postgresCreds.user,
            password: postgresCreds.password,
            database: "test_db",
            schema: schemaName,
            tableName: workspaceMeta.originalTable || dsName,
            datasetName: dsName,
            rules: rules,
            dataframeDicts: previewRes.data,
            forceExternalSchema: !isDbOrigin
          });
        }
        alert("Successfully mirrored anonymized data into PostgreSQL test_db!");
      } catch (err) {
        alert("PostgreSQL Extraction Error: " + (err.response?.data?.detail || err.message));
      } finally {
        setLoading(false);
      }
    } else if (extractionTarget === 'mysql') {
      setLoading(true);
      try {
        for (const dsName of selectedFilesToDownload) {
          const previewRes = await fetchAnonymizedPreview(dsName, rules, 1, 1000000);
          const workspaceMeta = savedWorkspace[dsName] || {};
          const isDbOrigin = workspaceMeta.originalDb && workspaceMeta.originalDb.toLowerCase().includes("mysql");

          await exportToMySQL({
            host: mysqlCreds.host || "localhost",
            port: mysqlCreds.port || 3306,
            user: mysqlCreds.user,
            password: mysqlCreds.password,
            database: isDbOrigin ? selectedDb : "test_db",
            tableName: workspaceMeta.originalTable || dsName,
            datasetName: dsName,
            rules: rules,
            dataframeDicts: previewRes.data
          });
        }
        alert("Successfully mirrored anonymized data into MySQL database!");
      } catch (err) {
        alert("MySQL Extraction Error: " + (err.response?.data?.detail || err.message));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleHomeClick = () => {
    setHomeModalOpen(true);
  };

  const handleHomeAgree = () => {
    setHomeModalOpen(false);
    setActiveDataset('');
    setColumns([]);
    setData([]);
    setRules({});
    setIsExecuted(false);
    setIsAnonymizedView(false);
    setSavedWorkspace({});
    localStorage.removeItem('saved_workspaces');

    setMysqlCreds({ host: 'localhost', port: 3306, user: 'root', password: '' });
    setSnowflakeCreds({ account: '', user: '', password: '', warehouse: 'COMPUTE_WH', role: '' });
    setPostgresCreds({ host: 'localhost', port: 5432, user: 'postgres', password: '' });
    setDbConnected(false);
    setDbList([]);
    setSelectedDb('');
    setSchemaList([]);
    setSelectedSchema('');
    setTableList([]);
    setSelectedTables([]);
    setUrlInput('');
    setS3Creds({ bucket: '', key: '', region: 'us-east-1', accessKeyId: '', secretAccessKey: '' });
    setAwsLoggedIn(false);
    setAwsBuckets([]);
    setAwsFolders([]);
    setAwsFiles([]);
    setSelectedAwsBucket('');
    setSelectedAwsFolder('');
    setCustomFolderInput('');
    setS3ExportCreds({ bucket: '', destinationKey: '', region: 'us-east-1', accessKeyId: '', secretAccessKey: '' });
  };

  const handleHomeDisagree = () => {
    setHomeModalOpen(false);
  };

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden font-sans m-0 p-0 ${isFullScreenTable ? 'fixed inset-0 z-50' : ''}`}
      style={{ backgroundColor: '#DFF4FF', position: 'fixed', top: 0, left: 0 }}
    >
      <header
        className="relative flex items-center justify-between px-6 border-b flex-shrink-0"
        style={{
          background: '#cde9f8',
          borderColor: '#E2E8F0',
          boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
          zIndex: 10,
          height: '30px',
          minHeight: '30px'
        }}
      >
        {!isSidebarOpen && (
          <IconButton
            size="small"
            onClick={() => setIsSidebarOpen(true)}
            title="Open Sidebar"
            style={{ color: '#1E293B' }}
          >
            <MenuIcon style={{ fontSize: 22 }} />
          </IconButton>
        )}
        {isSidebarOpen && <div style={{ width: '24px' }} />}

        <div
          style={{
            position: 'absolute',
            left: '10%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "8px",
              background: "linear-gradient(135deg,#8B5CF6,#2563EB)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: "14px"
            }}
          >
            D
          </div>
          <Typography
            style={{
              fontSize: '17px',
              fontWeight: 900,
              color: '#1E293B',
              letterSpacing: '-0.5px'
            }}
          >
            DataEase
          </Typography>
        </div>

        {activeDataset ? (
          <div className="flex items-left side space-x-4">
            {isExecuted && (
              <label className="switch" title="Toggle Anonymization View">
                <input
                  type="checkbox"
                  checked={isAnonymizedView}
                  onChange={(e) => handleToggleView(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            )}

            {hasConfiguredRules && (
              <Button
                variant="contained"
                onClick={() =>
                  applyAnonymization(
                    rules,
                    page,
                    rowsPerPage
                  )
                }
                sx={{
                  borderRadius: "8px",
                  textTransform: "none",
                  fontWeight: 700,
                  fontSize: "11px",
                  px: 2,
                  py: 0.4,
                  background: "linear-gradient(135deg,#8B5CF6,#6366F1)",
                  boxShadow: "0 4px 12px rgba(99,102,241,0.2)",
                  "&:hover": {
                    background: "linear-gradient(135deg,#7C3AED,#4F46E5)"
                  }
                }}
              >
                Run Anonymization
              </Button>
            )}

            <IconButton
              size="small"
              onClick={() => setIsFullScreenTable(!isFullScreenTable)}
              title="Expand Table to Complete Screen"
              sx={{
                ml: 1,
                background: "#F1F5F9",
                border: "1px solid #E2E8F0",
                color: "#334155",
                padding: '4px',
                "&:hover": {
                  background: "#E2E8F0"
                }
              }}
            >
              {isFullScreenTable ? (
                <FullscreenExitIcon sx={{ fontSize: 16 }} />
              ) : (
                <FullscreenIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </div>
        ) : (
          <div style={{ width: '24px' }} />
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {!isFullScreenTable && isSidebarOpen && (
          <aside
            className="w-56 flex flex-col justify-between p-2 shadow-xl border-r flex-shrink-0 h-full overflow-hidden"
            style={{ backgroundColor: '#D5E7ED', borderColor: '#94A3B8', color: '#0F172A' }}
          >
            <div className="flex items-center justify-between pb-1.5 flex-shrink-0 border-b" style={{ borderColor: '#CBD5E1' }}>
              <button
                className="home-custom-btn"
                onClick={handleHomeClick}
              >
                🏠 Home
              </button>
              <IconButton
                size="small"
                onClick={() => setIsSidebarOpen(false)}
                title="Collapse Sidebar"
                className="p-1"
                style={{ color: '#2563eb' }}
              >
                <MenuOpenIcon style={{ fontSize: 18 }} />
              </IconButton>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1 pt-2">
              {activeDataset && (
                <div className="flex flex-col pb-2 border-b" style={{ borderColor: '#94A3B8' }}>
                  <Typography
                    variant="caption"
                    className="font-extrabold uppercase text-[14px]"
                    style={{ color: '#4F46E5', borderColor: '#CBD5E1', fontWeight: 800 }}
                  >
                    📊 Rule Registry ({Object.values(rules).filter(r => r && r.algo && r.algo !== 'None').length})
                  </Typography>
                  <div className="space-y-1 pr-1 overflow-y-auto max-h-[140px]">
                    {columns.map(col => {
                      const r = rules[col];
                      if (!r || !r.algo || r.algo === 'None') return null;
                      return (
                        <div key={col} className="p-1 rounded text-[10px] flex justify-between items-center border" style={{ backgroundColor: '#ECFDF5', borderColor: '#CBD5E1', borderLeft: '3px solid #4F46E5' }}>
                          <span className="font-bold truncate max-w-[100px]" style={{ color: '#1E293B' }}>{col}</span>
                          <span className="font-bold px-1 py-0.2 rounded text-[8px]" style={{ backgroundColor: '#D1FAE5', color: '#047857' }}>
                            {r.algo}
                          </span>
                        </div>
                      );
                    })}
                    {Object.values(rules).filter(r => r && r.algo && r.algo !== 'None').length === 0 && (
                      <Typography variant="caption" className="italic block pl-1 text-[12px]" style={{ color: '#64748B' }}>
                        No rules configured.
                      </Typography>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col pt-1">
                <div
                  className="flex items-center justify-between cursor-pointer border-b pb-0.5 mb-1 sticky top-0 bg-[#D5E7ED] z-10"
                  style={{ borderColor: '#CBD5E1' }}
                  onClick={() => setIsWorkspacesOpen(!isWorkspacesOpen)}
                >
                  <Typography
                    variant="caption"
                    className="font-extrabold uppercase text-[14px]"
                    style={{ color: '#4F46E5', fontWeight: 800 }}
                  >
                    📁 {isWorkspacesOpen ? 'Hide Workspaces' : 'Saved Workspaces'}
                  </Typography>
                  <span className="text-[10px] font-bold" style={{ color: '#4F46E5' }}>{isWorkspacesOpen ? '▲' : '▼'}</span>
                </div>

                {isWorkspacesOpen && (
                  Object.keys(savedWorkspace).length === 0 ? (
                    <Typography variant="caption" className="italic block pl-1 text-[12px]" style={{ color: '#64748B' }}>
                      No saved workspaces.
                    </Typography>
                  ) : (
                    <div className="space-y-1 pr-1 overflow-y-auto max-h-[140px]">
                      {Object.keys(savedWorkspace).map(dsName => (
                        <div
                          key={dsName}
                          className={`flex items-center justify-between p-1 rounded text-[10px] transition-colors cursor-pointer border ${
                            activeDataset === dsName ? 'font-bold' : ''
                          }`}
                          style={{
                            backgroundColor: activeDataset === dsName ? '#334155' : '#FFFFFF',
                            color: activeDataset === dsName ? '#FFFFFF' : '#1E293B',
                            borderColor: '#CBD5E1'
                          }}
                        >
                          <span
                            className="truncate flex-1"
                            onClick={async () => {
                              setActiveDataset(dsName);
                              setColumns(savedWorkspace[dsName].columns);
                              const previewRes = await fetchDatasetPreview(dsName, 1, rowsPerPage);
                              setData(previewRes.data);
                              setTotalRows(previewRes.total_rows);
                              setIsExecuted(false);
                            }}
                          >
                            {activeDataset === dsName ? '⚡ ' : ''}{dsName}
                          </span>
                          <IconButton size="small" onClick={() => handleDeleteDataset(dsName)} className="p-0.5" style={{ color: '#B91C1C' }}>
                            <DeleteIcon style={{ fontSize: 11 }} />
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="space-y-1 pb-1 pt-1 border-t mt-0 flex-shrink-0" style={{ borderColor: '#CBD5E1' }}>
              {activeDataset && (
                <div className="flex flex-col pb-2 mb-1 border-b" style={{ borderColor: '#CBD5E1' }}>
                  <Typography
                    variant="caption"
                    className="font-extrabold uppercase text-[12px] mb-1.5"
                    style={{ color: '#4F46E5', fontWeight: 800 }}
                  >
                    🌐 Data Ingestion Hub
                  </Typography>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setActiveIngestModal('file')}
                      fullWidth
                      style={{ fontSize: '10px', padding: '6px', borderColor: '#CBD5E1', background: '#FFFFFF', color: '#1E293B', fontWeight: 700, justifyContent: 'flex-start', textTransform: 'none' }}
                    >
                      📁 Import Files
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setActiveIngestModal('db')}
                      fullWidth
                      style={{ fontSize: '10px', padding: '6px', borderColor: '#CBD5E1', background: '#FFFFFF', color: '#1E293B', fontWeight: 700, justifyContent: 'flex-start', textTransform: 'none' }}
                    >
                      🔌 Database
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setActiveIngestModal('s3')}
                      fullWidth
                      style={{ fontSize: '10px', padding: '6px', borderColor: '#CBD5E1', background: '#FFFFFF', color: '#1E293B', fontWeight: 700, justifyContent: 'flex-start', textTransform: 'none' }}
                    >
                      ☁️ Amazon S3
                    </Button>
                  </div>
                </div>
              )}

              {hasConfiguredRules && (
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<RestartAltIcon style={{ fontSize: 12 }} />}
                  onClick={handleResetConfig}
                  className="font-bold py-0.5 text-[10px]"
                  style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', boxShadow: 'none', marginBottom: '8px' }}
                >
                  Reset Config
                </Button>
              )}

              {isExecuted && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginTop: '4px'
                  }}
                >
                  {(() => {
                    const workspaceMeta = savedWorkspace[activeDataset] || {};
                    const origDb = (workspaceMeta.originalDb || "").toLowerCase();
                    const isLocalOrUrl = !workspaceMeta.originalDb || origDb.includes("url") || origDb.includes("file") || origDb === "my_db" || origDb === "local_url";

                    return (
                      <>
                        {isLocalOrUrl && (
                          <Button
                            fullWidth
                            variant="contained"
                            startIcon={<DownloadIcon style={{ fontSize: 12 }} />}
                            onClick={() => {
                              setSelectedFilesToDownload(activeDataset ? [activeDataset] : []);
                              setDownloadModalOpen(true);
                            }}
                            style={{
                              background: 'linear-gradient(135deg,#10B981,#059669)',
                              color: '#fff',
                              fontWeight: 700,
                              textTransform: 'none'
                            }}
                          >
                            Download
                          </Button>
                        )}

                        {!isLocalOrUrl && (
                          <Button
                            fullWidth
                            variant="contained"
                            startIcon={<CloudIcon style={{ fontSize: 12 }} />}
                            onClick={() => {
                              setSelectedFilesToDownload(activeDataset ? [activeDataset] : []);
                              if (origDb.includes("snowflake")) setExtractionTarget('snowflake');
                              else if (origDb.includes("postgres")) setExtractionTarget('postgres');
                              else if (origDb.includes("mysql")) setExtractionTarget('mysql');
                              else if (origDb.includes("s3") || origDb.includes("aws")) setExtractionTarget('aws');
                              setExportModalOpen(true);
                            }}
                            style={{
                              background: 'linear-gradient(135deg,#4F46E5,#06B6D4)',
                              color: '#fff',
                              fontWeight: 700,
                              textTransform: 'none'
                            }}
                          >
                            Export
                          </Button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </aside>
        )}

        <main className={`flex-1 flex flex-col h-full overflow-hidden p-0 ${isFullScreenTable ? 'bg-white absolute inset-0 z-50' : ''}`} style={{
          background: '#DFF4FF'
        }}>
          {isFullScreenTable && (
            <div className="flex justify-between items-center p-2 rounded-none flex-shrink-0 border-b" style={{ backgroundColor: '#7D92A3', borderColor: '#CBD5E1', color: '#1E293B' }}>
              <Typography variant="caption" className="font-bold text-xs" style={{ color: '#1E293B' }}>
                📊 Full Screen View: {activeDataset}
              </Typography>
              <IconButton size="small" onClick={() => setIsFullScreenTable(false)} className="p-0.5 rounded" style={{ backgroundColor: '#334155', color: '#FFFFFF' }}>
                <FullscreenExitIcon fontSize="small" />
              </IconButton>
            </div>
          )}

          {!activeDataset ? (
            <div
              className="mx-auto w-full overflow-y-auto flex flex-col dashboard-container"
              style={{
                padding: '0px 12px 0px 12px',
                minHeight: '100%',
                backgroundColor: '#DFF4FF'
              }}
            >
              <div className="title-container">
                <Typography
                  className="page-title"
                  sx={{
                    width: "100%",
                    textAlign: "center",
                    fontSize: "16px",
                    fontWeight: 800,
                    marginTop: "20px",
                    marginBottom: " 20px",
                    color: "#000000"
                  }}
                >
                  ✨ Quick Data Ingestion Hub
                </Typography>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                justifyContent: 'center',
                alignItems: 'stretch',
                gap: '24px',
                width: '100%'
              }}>
                <div style={{ padding: '22px', background: '#FFFFFF', border: '1px solid #080808', borderRadius: '16px', boxShadow: '0 20px 24px rgba(15,23,42,0.12)', flex: '1 1 320px', minWidth: '260px', maxWidth: '400px', height: '380px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                  <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B5CF6', marginRight: '10px' }}>
                      <FolderOpenIcon sx={{ fontSize: 20 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#1E293B', marginBottom: '10px' }}>
                        Import Files
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Browse local files or enter a direct URL path
                      </div>
                    </div>
                  </div>

                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    style={{ 
                      marginTop: '14px',
                      padding: '12px 8px', 
                      borderRadius: '10px', 
                      background: isDragging ? '#F3E8FF' : '#FAFBFF', 
                      border: isDragging ? '2px dashed #5d18fd' : '1.5px dashed #C4B5FD', 
                      textAlign: 'center',
                      transition: 'all 0.2s ease',
                      marginBottom:'8px'
                    }}
                  >
                    <div style={{ marginBottom: '2px' }}>
                      <CloudUploadIcon sx={{ fontSize: 20, color: "#2563eb" }} />
                    </div>
                    <Typography sx={{ fontSize: '12px', fontWeight: 700, color: "#1E293B" }}>
                      Drag & Drop Files Here
                    </Typography>
                    <Button
                      component="label"
                      variant="contained"
                      sx={{
                        mt: 1,
                        borderRadius: "6px",
                        textTransform: "none",
                        fontSize: "11px",
                        fontWeight: 700,
                        py: 0.3,
                        px: 1.5,
                        background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                        boxShadow: '0 3px 8px rgba(109,40,217,0.2)'
                      }}
                    >
                      Upload Files
                      <input hidden multiple type="file" onChange={handleFileUpload} />
                    </Button>
                  </div>

                  <Divider sx={{ my: 1.5 }}>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#0b0b0b', textTransform: 'uppercase' }}>OR DIRECT URL</span>
                  </Divider>

                  <div className="space-y-1">
                    <input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://example.com/sample.csv or C:\path\file.csv"
                      style={{ fontSize: '11px', padding: '20px 10px', width: '100%', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B', height: '5px', marginTop: '7px' }}
                    />
                    <button style={{ marginTop: '16px',fontSize: '12px',width: '100%',background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                    onClick={() => processUrlFetch()}
                    disabled={!urlInput || loadingUrl}
                    >
                      {loadingUrl ? "Fetching..." : (<><LinkIcon sx={{ fontSize: 14 }} /> Fetch Data</>)}
                    </button>
                  </div>
                </div>

                <div style={{ padding: '22px', background: '#FFFFFF', border: '1px solid #080808', borderRadius: '16px', boxShadow: '0 4px 14px rgba(15,23,42,0.04)', flex: '1 1 320px', minWidth: '260px', maxWidth: '400px', height: '380px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284C7', marginRight: '10px' }}>
                      <StorageIcon sx={{ fontSize: 20 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#1E293B', marginBottom: '10px' }}>
                        Database
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Connect to database & import tables
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px', flex: 1, minHeight: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '12px', color: '#0f172a', mb: 0 }}>
                      Select Provider:
                    </Typography>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[
                        { label: 'MySQL', icon: '🐬', val: 'MySQL' },
                        { label: 'Snowflake', icon: '❄️', val: 'Snowflake' },
                        { label: 'PostgreSQL', icon: '🐘', val: 'PostgreSQL' },
                        { label: 'SQL Server', icon: '🗄️', val: 'SQL Server' }
                      ].map((item) => {
                        const isSelected = dbPlatform === item.val;
                        return (
                          <button
                            key={item.val}
                            onClick={() => {
                              setDbPlatform(item.val);
                              setDbConnected(false);
                              setDbList([]);
                              setSelectedDb('');
                              setSchemaList([]);
                              setSelectedSchema('');
                              setTableList([]);
                              setSelectedTables([]);
                            }}
                            style={{
                              fontSize: '11px',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              border: isSelected ? '1.5px solid #0c0c0c' : '1px solid #E2E8F0',
                              background: isSelected ? '#E0F2FE' : '#F8FAFC',
                              color: isSelected ? '#111112' : '#334155',
                              fontWeight: isSelected ? 700 : 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span style={{ fontSize: '12px' }}>{item.icon}</span> {item.label}
                          </button>
                        );
                      })}
                    </div>

                    {dbPlatform && (
                      <div
                        style={{
                          marginTop: '4px',
                          padding: '8px',
                          background: '#ECFDF5',
                          border: '1px solid #A7F3D0',
                          borderRadius: '10px',
                          color: '#065F46',
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: 0,
                          overflowY: 'auto'
                        }}
                      >
                        {!dbConnected ? (
                          <>
                            {dbPlatform === "MySQL" ? (
                              <>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', mb: '2px', color: '#047857' }}>MySQL Credentials</div>
                                <input
                                  type="text"
                                  placeholder="Host"
                                  value={mysqlCreds.host}
                                  onChange={(e) => setMysqlCreds({ ...mysqlCreds, host: e.target.value })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '2px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                                <input
                                  type="number"
                                  placeholder="Port (e.g. 3306)"
                                  value={mysqlCreds.port}
                                  onChange={(e) => setMysqlCreds({ ...mysqlCreds, port: parseInt(e.target.value) || 3306 })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '2px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                                <input
                                  type="text"
                                  placeholder="Username"
                                  value={mysqlCreds.user}
                                  onChange={(e) => setMysqlCreds({ ...mysqlCreds, user: e.target.value })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '2px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                                <input
                                  type="password"
                                  placeholder="Password"
                                  value={mysqlCreds.password}
                                  onChange={(e) => setMysqlCreds({ ...mysqlCreds, password: e.target.value })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '2px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                              </>
                            ) : dbPlatform === "Snowflake" ? (
                              <>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', mb: '10px', color: '#047857' }}>Snowflake Credentials</div>
                                <input
                                  type="text"
                                  placeholder="Account ID"
                                  value={snowflakeCreds.account}
                                  onChange={(e) => setSnowflakeCreds({ ...snowflakeCreds, account: e.target.value })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '3px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                                <input
                                  type="text"
                                  placeholder="Username"
                                  value={snowflakeCreds.user}
                                  onChange={(e) => setSnowflakeCreds({ ...snowflakeCreds, user: e.target.value })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '3px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                                <input
                                  type="password"
                                  placeholder="Password"
                                  value={snowflakeCreds.password}
                                  onChange={(e) => setSnowflakeCreds({ ...snowflakeCreds, password: e.target.value })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '3px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                                <input
                                  type="text"
                                  placeholder="Warehouse (COMPUTE_WH)"
                                  value={snowflakeCreds.warehouse}
                                  onChange={(e) => setSnowflakeCreds({ ...snowflakeCreds, warehouse: e.target.value })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '3px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                              </>
                            ) : dbPlatform === "PostgreSQL" ? (
                              <>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', mb: '10px', color: '#047857' }}>PostgreSQL Credentials</div>
                                <input
                                  type="text"
                                  placeholder="Host (e.g. localhost)"
                                  value={postgresCreds.host}
                                  onChange={(e) => setPostgresCreds({ ...postgresCreds, host: e.target.value })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '3px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                                <input
                                  type="number"
                                  placeholder="Port (e.g. 5432)"
                                  value={postgresCreds.port}
                                  onChange={(e) => setPostgresCreds({ ...postgresCreds, port: parseInt(e.target.value) || 5432 })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '3px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                                <input
                                  type="text"
                                  placeholder="Username (e.g. postgres)"
                                  value={postgresCreds.user}
                                  onChange={(e) => setPostgresCreds({ ...postgresCreds, user: e.target.value })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '3px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                                <input
                                  type="password"
                                  placeholder="Password"
                                  value={postgresCreds.password}
                                  onChange={(e) => setPostgresCreds({ ...postgresCreds, password: e.target.value })}
                                  style={{ fontSize: '11px', padding: '3px 5px', marginTop: '3px', width: '100%', borderRadius: '4px', border: '1.5px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                                />
                              </>
                            ) : (
                              <div style={{ fontSize: '11px', padding: '6px', textAlign: 'center', color: '#047857', fontStyle: 'italic' }}>
                                {dbPlatform} connection settings will appear here.
                              </div>
                            )}

                            {(dbPlatform === "MySQL" || dbPlatform === "Snowflake" || dbPlatform === "PostgreSQL") && (
                              <button
                                style={{
                                  marginTop: '6px',
                                  fontSize: '12px',
                                  width: '100%',
                                  height: '34px',
                                  background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '8px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  padding: '18px 16px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px'
                                }}
                                onClick={() => handleConnectDb()}
                              >
                                <StorageIcon sx={{ fontSize: 14 }} />
                                Connect Database
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <FormControl fullWidth size="small" sx={{ mt: 0.5, background: '#F8FAFC', borderRadius: '4px' }}>
                              <InputLabel sx={{ fontSize: '11px' }}>Database</InputLabel>
                              <Select value={selectedDb} label="Database" onChange={(e) => handleSelectDb(e.target.value)} sx={{ fontSize: '11px', height: '24px' }}>
                                {dbList.map((db) => <MenuItem key={db} value={db} sx={{ fontSize: '11px' }}>{db}</MenuItem>)}
                              </Select>
                            </FormControl>

                            {(dbPlatform === 'Snowflake' || dbPlatform === 'PostgreSQL') && selectedDb && (
                              <FormControl fullWidth size="small" sx={{ mt: 0.6, background: '#F8FAFC', borderRadius: '4px' }}>
                                <InputLabel sx={{ fontSize: '11px' }}>Schema</InputLabel>
                                <Select value={selectedSchema} label="Schema" disabled={loadingSchemas} onChange={(e) => handleSelectSchema(e.target.value)} sx={{ fontSize: '11px', height: '24px' }}>
                                  <MenuItem value=""><em>{loadingSchemas ? "Loading..." : "Select Schema"}</em></MenuItem>
                                  {schemaList.map((sch) => <MenuItem key={sch} value={sch} sx={{ fontSize: '11px' }}>{sch}</MenuItem>)}
                                </Select>
                              </FormControl>
                            )}

                            {tableList.length > 0 && (
                              <div style={{ marginTop: "4px", maxHeight: "110px", overflowY: "auto", fontSize: "11px", border: '1px solid #A7F3D0', borderRadius: '4px', padding: '4px', background: '#FFFFFF' }}>
                                <span style={{ fontWeight: 600, fontSize: '11px', color: '#065F46', display: 'block', mb: '2px' }}>Select Tables:</span>
                                {tableList.map((table) => (
                                  <FormControlLabel
                                    key={table}
                                    sx={{ display: 'block', m: 0, '& .MuiFormControlLabel-label': { fontSize: '11px' } }}
                                    control={
                                      <Checkbox
                                        size="small"
                                        sx={{ p: 0.1 }}
                                        checked={selectedTables.includes(table)}
                                        onChange={(e) => {
                                          if (e.target.checked) setSelectedTables([...selectedTables, table]);
                                          else setSelectedTables(selectedTables.filter((t) => t !== table));
                                        }}
                                      />
                                    }
                                    label={table}
                                  />
                                ))}
                              </div>
                            )}

                            {tableList.length > 0 && (
                              <div style={{ marginTop: '6px' }}>
                                <button
                                  style={{ fontSize: '11px', width: '100%', background: '#10B981', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', padding: '5px' }}
                                  onClick={() => processDbImport()}
                                  disabled={selectedTables.length === 0 || loadingImport}
                                >
                                  {loadingImport ? "Importing..." : `Import Tables (${selectedTables.length})`}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* AMAZON S3 HUB CARD WITH FOLDERS & FILES BROWSER */}
                <div style={{ padding: '22px', background: '#FFFFFF', border: '1px solid #080808', borderRadius: '16px', boxShadow: '0 4px 14px rgba(15,23,42,0.04)', flex: '1 1 320px', minWidth: '260px', maxWidth: '400px', height: '380px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                  <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706', marginRight: '10px', flexShrink: 0 }}>
                      <CloudIcon sx={{ fontSize: 20 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#1E293B', marginBottom: '10px' }}>
                        Amazon S3
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Stream raw files from AWS S3 buckets
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <input 
                      type="password" 
                      placeholder="Access Key ID" 
                      value={s3Creds.accessKeyId} 
                      onChange={e => setS3Creds({ ...s3Creds, accessKeyId: e.target.value })} 
                      style={{ width: '100%', fontSize: '11px', padding: '6px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }} 
                    />
                    <input 
                      type="password" 
                      placeholder="Secret Access Key" 
                      value={s3Creds.secretAccessKey} 
                      onChange={e => setS3Creds({ ...s3Creds, secretAccessKey: e.target.value })} 
                      style={{ width: '100%', fontSize: '11px', padding: '6px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }} 
                    />

                    {!awsLoggedIn ? (
                      <button
                        style={{ marginTop: '4px', fontSize: '11px', width: '100%', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', padding: '8px' }}
                        onClick={async () => {
                          if (!s3Creds.accessKeyId || !s3Creds.secretAccessKey) {
                            alert("Please enter both Access Key ID and Secret Access Key.");
                            return;
                          }
                          await handleFetchAwsBuckets(s3Creds);
                        }}
                        disabled={loadingAwsBuckets}
                      >
                        {loadingAwsBuckets ? "Connecting..." : "Login & Load Buckets"}
                      </button>
                    ) : (
                      <>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#059669' }}>✅ Connected to AWS S3</div>
                        <select 
                          value={s3Creds.bucket} 
                          onChange={async e => {
                            const bName = e.target.value;
                            setS3Creds({ ...s3Creds, bucket: bName, key: '' });
                            if (bName) {
                              try {
                                const res = await fetchS3Objects(bName, "", s3Creds);
                                setAwsFolders(res.folders || []);
                                setAwsFiles(res.files || []);
                              } catch {
                                setAwsFolders([]);
                                setAwsFiles([]);
                              }
                            }
                          }} 
                          style={{ width: '100%', fontSize: '11px', padding: '6px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                        >
                          <option value="">-- Select S3 Bucket --</option>
                          {awsBuckets.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>

                        {s3Creds.bucket && (
                          <div className="space-y-1">
                            <select 
                              onChange={async e => {
                                const val = e.target.value;
                                if (!val) return;
                                if (val.endsWith('/')) {
                                  const res = await fetchS3Objects(s3Creds.bucket, val, s3Creds);
                                  setAwsFolders(res.folders || []);
                                  setAwsFiles(res.files || []);
                                  setS3Creds({ ...s3Creds, key: val });
                                } else {
                                  setS3Creds({ ...s3Creds, key: val });
                                }
                              }}
                              style={{ width: '100%', fontSize: '11px', padding: '6px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}
                            >
                              <option value="">-- Browse Folders & Files --</option>
                              {awsFolders.map(folder => (
                                <option key={folder} value={folder}>📁 {folder}</option>
                              ))}
                              {awsFiles.map(file => (
                                <option key={file} value={file}>📄 {file}</option>
                              ))}
                            </select>

                            <input 
                              type="text" 
                              placeholder="Selected File Path" 
                              value={s3Creds.key} 
                              onChange={e => setS3Creds({ ...s3Creds, key: e.target.value })} 
                              style={{ width: '100%', fontSize: '11px', padding: '6px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B', marginTop: '4px' }} 
                            />
                          </div>
                        )}

                        <button
                          style={{ marginTop: '4px', fontSize: '11px', width: '100%', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', padding: '8px' }}
                          onClick={() => processS3Fetch()}
                          disabled={!s3Creds.bucket || !s3Creds.key || loading}
                        >
                          {loading ? "Streaming..." : "Fetch File from S3"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {loading && <CircularProgress size={20} className="block mx-auto mt-2" />}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden space-y-1">
              {loading && <CircularProgress size={18} className="block mx-auto my-0.5" />}

              <div className="flex-1 min-h-0 overflow-hidden border rounded" style={{ backgroundColor: '#DFF4FF', borderColor: '#CBD5E1' }}>
                <DataPreviewTable
                  columns={columns}
                  data={data}
                  rules={rules}
                  totalRows={totalRows}
                  page={page}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(newLimit) => {
                    setRowsPerPage(newLimit);
                  }}
                  onPageChange={handlePageChange}
                  onSaveRule={handleSaveRule}
                  isExecuted={isExecuted}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      <Dialog
        open={activeIngestModal !== null}
        onClose={() => setActiveIngestModal(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle className="flex justify-between items-center font-bold text-sm" style={{ color: '#1E293B' }}>
          <span>
            {activeIngestModal === 'file' && '📁 Import Files & URLs'}
            {activeIngestModal === 'db' && '🔌 Connect Database & Import Tables'}
            {activeIngestModal === 's3' && '☁️ Stream from Amazon S3'}
          </span>
          <IconButton size="small" onClick={() => setActiveIngestModal(null)}>✕</IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {activeIngestModal === 'file' && (
            <div className="space-y-3">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{ 
                  padding: '16px 8px', 
                  borderRadius: '10px', 
                  background: isDragging ? '#F3E8FF' : '#FAFBFF', 
                  border: isDragging ? '2px dashed #5d18fd' : '1.5px dashed #C4B5FD', 
                  textAlign: 'center'
                }}
              >
                <CloudUploadIcon sx={{ fontSize: 24, color: "#2563eb" }} />
                <Typography sx={{ fontSize: '11px', fontWeight: 700, color: "#1E293B", mt: 1 }}>
                  Drag & Drop Files Here
                </Typography>
                <Button
                  component="label"
                  variant="contained"
                  size="small"
                  sx={{ mt: 1, textTransform: "none", fontSize: "10px", fontWeight: 700 }}
                >
                  Browse Files
                  <input hidden multiple type="file" onChange={handleFileUpload} />
                </Button>
              </div>

              <Divider>OR DIRECT URL</Divider>

              <div>
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/sample.csv"
                  style={{ fontSize: '11px', padding: '8px', width: '100%', borderRadius: '6px', border: '1px solid #CBD5E1', marginBottom: '8px' }}
                />
                <Button
                  fullWidth
                  variant="contained"
                  size="small"
                  onClick={() => processUrlFetch()}
                  disabled={!urlInput || loadingUrl}
                  style={{ textTransform: 'none', fontWeight: 700 }}
                >
                  {loadingUrl ? "Fetching..." : "Fetch Data from URL"}
                </Button>
              </div>
            </div>
          )}

          {activeIngestModal === 'db' && (
            <div className="space-y-2">
              <Typography sx={{ fontWeight: 700, fontSize: '11px' }}>Select Provider:</Typography>
              <div className="flex gap-1 flex-wrap">
                {['MySQL', 'Snowflake', 'PostgreSQL', 'SQL Server'].map((platform) => (
                  <Button
                    key={platform}
                    variant={dbPlatform === platform ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => {
                      setDbPlatform(platform);
                      setDbConnected(false);
                      setDbList([]);
                      setSelectedDb('');
                    }}
                    style={{ fontSize: '10px', textTransform: 'none' }}
                  >
                    {platform}
                  </Button>
                ))}
              </div>

              {dbPlatform && (
                <div className="mt-2 space-y-2 p-2 bg-slate-50 border rounded">
                  {!dbConnected ? (
                    <>
                      {dbPlatform === 'MySQL' && (
                        <>
                          <input type="text" placeholder="Host" value={mysqlCreds.host} onChange={e => setMysqlCreds({ ...mysqlCreds, host: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                          <input type="number" placeholder="Port" value={mysqlCreds.port} onChange={e => setMysqlCreds({ ...mysqlCreds, port: parseInt(e.target.value) || 3306 })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                          <input type="text" placeholder="Username" value={mysqlCreds.user} onChange={e => setMysqlCreds({ ...mysqlCreds, user: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                          <input type="password" placeholder="Password" value={mysqlCreds.password} onChange={e => setMysqlCreds({ ...mysqlCreds, password: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                        </>
                      )}
                      {dbPlatform === 'Snowflake' && (
                        <>
                          <input type="text" placeholder="Account ID" value={snowflakeCreds.account} onChange={e => setSnowflakeCreds({ ...snowflakeCreds, account: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                          <input type="text" placeholder="Username" value={snowflakeCreds.user} onChange={e => setSnowflakeCreds({ ...snowflakeCreds, user: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                          <input type="password" placeholder="Password" value={snowflakeCreds.password} onChange={e => setSnowflakeCreds({ ...snowflakeCreds, password: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                          <input type="text" placeholder="Warehouse" value={snowflakeCreds.warehouse} onChange={e => setSnowflakeCreds({ ...snowflakeCreds, warehouse: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                        </>
                      )}
                      {dbPlatform === 'PostgreSQL' && (
                        <>
                          <input type="text" placeholder="Host (e.g. localhost)" value={postgresCreds.host} onChange={e => setPostgresCreds({ ...postgresCreds, host: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                          <input type="number" placeholder="Port (e.g. 5432)" value={postgresCreds.port} onChange={e => setPostgresCreds({ ...postgresCreds, port: parseInt(e.target.value) || 5432 })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                          <input type="text" placeholder="Username" value={postgresCreds.user} onChange={e => setPostgresCreds({ ...postgresCreds, user: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                          <input type="password" placeholder="Password" value={postgresCreds.password} onChange={e => setPostgresCreds({ ...postgresCreds, password: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', marginBottom: '4px' }} />
                        </>
                      )}
                      <Button fullWidth variant="contained" size="small" onClick={handleConnectDb} style={{ fontSize: '10px', textTransform: 'none', mt: 1 }}>
                        Connect Database
                      </Button>
                    </>
                  ) : (
                    <>
                      <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                        <InputLabel style={{ fontSize: 10 }}>Database</InputLabel>
                        <Select value={selectedDb} label="Database" onChange={e => handleSelectDb(e.target.value)} style={{ fontSize: 10 }}>
                          {dbList.map(db => <MenuItem key={db} value={db} style={{ fontSize: 10 }}>{db}</MenuItem>)}
                        </Select>
                      </FormControl>

                      {(dbPlatform === 'Snowflake' || dbPlatform === 'PostgreSQL') && selectedDb && (
                        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                          <InputLabel style={{ fontSize: 10 }}>Schema</InputLabel>
                          <Select value={selectedSchema} label="Schema" onChange={e => handleSelectSchema(e.target.value)} style={{ fontSize: 10 }}>
                            {schemaList.map(sch => <MenuItem key={sch} value={sch} style={{ fontSize: 10 }}>{sch}</MenuItem>)}
                          </Select>
                        </FormControl>
                      )}

                      {tableList.length > 0 && (
                        <div className="max-h-32 overflow-y-auto border p-1 rounded bg-white" style={{ fontSize: 10 }}>
                          {tableList.map(t => (
                            <FormControlLabel
                              key={t}
                              control={<Checkbox size="small" checked={selectedTables.includes(t)} onChange={e => {
                                if (e.target.checked) setSelectedTables([...selectedTables, t]);
                                else setSelectedTables(selectedTables.filter(x => x !== t));
                              }} />}
                              label={<span style={{ fontSize: 10 }}>{t}</span>}
                            />
                          ))}
                        </div>
                      )}

                      {tableList.length > 0 && (
                        <Button fullWidth variant="contained" color="success" size="small" onClick={processDbImport} disabled={selectedTables.length === 0 || loadingImport} style={{ fontSize: 10, mt: 1 }}>
                          {loadingImport ? "Importing..." : `Import Tables (${selectedTables.length})`}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {activeIngestModal === 's3' && (
            <div className="space-y-2">
              <input type="password" placeholder="Access Key ID" value={s3Creds.accessKeyId} onChange={e => setS3Creds({ ...s3Creds, accessKeyId: e.target.value })} style={{ width: '100%', fontSize: '11px', padding: '6px', borderRadius: '4px', border: '1px solid #CBD5E1' }} />
              <input type="password" placeholder="Secret Key" value={s3Creds.secretAccessKey} onChange={e => setS3Creds({ ...s3Creds, secretAccessKey: e.target.value })} style={{ width: '100%', fontSize: '11px', padding: '6px', borderRadius: '4px', border: '1px solid #CBD5E1' }} />
              
              {!awsLoggedIn ? (
                <Button fullWidth variant="contained" size="small" onClick={() => handleFetchAwsBuckets(s3Creds)} disabled={loadingAwsBuckets} style={{ textTransform: 'none', fontSize: '11px', mt: 1 }}>
                  {loadingAwsBuckets ? "Connecting..." : "Login & Load Buckets"}
                </Button>
              ) : (
                <>
                  <select value={s3Creds.bucket} onChange={async e => {
                    const bName = e.target.value;
                    setS3Creds({ ...s3Creds, bucket: bName, key: '' });
                    if (bName) {
                      try {
                        const res = await fetchS3Objects(bName, "", s3Creds);
                        setAwsFolders(res.folders || []);
                        setAwsFiles(res.files || []);
                      } catch { 
                        setAwsFolders([]); 
                        setAwsFiles([]); 
                      }
                    }
                  }} style={{ width: '100%', fontSize: '11px', padding: '6px', borderRadius: '4px', border: '1px solid #CBD5E1' }}>
                    <option value="">-- Select Bucket --</option>
                    {awsBuckets.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>

                  {s3Creds.bucket && (
                    <select onChange={async e => {
                      const val = e.target.value;
                      if (!val) return;
                      if (val.endsWith('/')) {
                        const res = await fetchS3Objects(s3Creds.bucket, val, s3Creds);
                        setAwsFolders(res.folders || []);
                        setAwsFiles(res.files || []);
                        setS3Creds({ ...s3Creds, key: val });
                      } else {
                        setS3Creds({ ...s3Creds, key: val });
                      }
                    }} style={{ width: '100%', fontSize: '11px', padding: '6px', borderRadius: '4px', border: '1px solid #CBD5E1', mt: 1 }}>
                      <option value="">-- Browse Folders & Files --</option>
                      {awsFolders.map(folder => <option key={folder} value={folder}>📁 {folder}</option>)}
                      {awsFiles.map(file => <option key={file} value={file}>📄 {file}</option>)}
                    </select>
                  )}

                  {s3Creds.bucket && (
                    <input type="text" placeholder="Object Key (path/file.csv)" value={s3Creds.key} onChange={e => setS3Creds({ ...s3Creds, key: e.target.value })} style={{ width: '100%', fontSize: '11px', padding: '6px', borderRadius: '4px', border: '1px solid #CBD5E1', mt: 1 }} />
                  )}

                  <Button fullWidth variant="contained" size="small" onClick={() => processS3Fetch()} disabled={!s3Creds.bucket || !s3Creds.key || loading} style={{ textTransform: 'none', fontSize: '11px', mt: 1 }}>
                    {loading ? "Streaming..." : "Fetch from S3"}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveIngestModal(null)} size="small" color="inherit">Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={duplicateModal.open}
        onClose={() => setDuplicateModal({ open: false, type: '', payload: null, existingName: '' })}
      >
        <DialogTitle className="flex items-center font-bold text-xs" style={{ color: '#B91C1C' }}>
          <WarningAmberIcon className="mr-1" fontSize="small" /> File Already Exists
        </DialogTitle>
        <DialogContent>
          <DialogContentText className="text-[11px]" style={{ color: '#1E293B' }}>
            The dataset <strong>"{duplicateModal.existingName}"</strong> already exists in your saved workspace.
            <br /><br />
            Do you want to upload the file at any cost? It will be saved as <strong>"{generateVersionedName(duplicateModal.existingName)}"</strong>.
          </DialogContentText>
        </DialogContent>
        <DialogActions className="p-2 pt-0">
          <Button onClick={() => setDuplicateModal({ open: false, type: '', payload: null, existingName: '' })} color="inherit" className="text-[10px]" style={{ color: '#64748B' }}>
            Cancel
          </Button>
          <Button onClick={handleUploadAtAnyCost} variant="contained" className="font-bold text-[10px]" style={{ backgroundColor: '#b0dd3e', color: '#FFFFFF', boxShadow: 'none' }}>
            UPLOAD AS A COPY
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={homeModalOpen}
        onClose={handleHomeDisagree}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle className="flex items-center font-bold text-xs" style={{ color: '#4F46E5' }}>
          <WarningAmberIcon className="mr-1" fontSize="small" /> Leave Workspace?
        </DialogTitle>
        <DialogContent>
          <DialogContentText className="text-[11px]" style={{ color: '#1E293B' }}>
            You are leaving the Workspace. If you leave, the configurations will be reset automatically. Do you agree or Disagree?
          </DialogContentText>
        </DialogContent>
        <DialogActions className="p-2">
          <Button onClick={handleHomeDisagree} color="inherit" className="text-[10px]" style={{ color: '#64748B' }}>
            Disagree
          </Button>
          <Button onClick={handleHomeAgree} variant="contained" className="font-bold text-[10px]" style={{ backgroundColor: '#4F46E5', color: '#FFFFFF', boxShadow: 'none' }}>
            Agree
          </Button>
        </DialogActions>
      </Dialog>

      {/* DOWNLOAD MODAL */}
      <Dialog
        open={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle
          className="font-bold text-xs flex items-center"
          style={{ color: '#1E293B' }}
        >
          <DownloadIcon
            className="mr-1 text-green-600"
            fontSize="small"
          />
          Download Dataset
        </DialogTitle>

        <DialogContent>
          <FormGroup
            className="space-y-1 max-h-40 overflow-y-auto border p-2 rounded"
            style={{
              backgroundColor: '#F8FAFC',
              borderColor: '#CBD5E1'
            }}
          >
            {(activeDataset ? [activeDataset] : []).map(fileName => {
              const checked =
                selectedFilesToDownload.includes(fileName);

              return (
                <FormControlLabel
                  key={fileName}
                  control={
                    <Checkbox
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFilesToDownload([
                            ...selectedFilesToDownload,
                            fileName
                          ]);
                        } else {
                          setSelectedFilesToDownload(
                            selectedFilesToDownload.filter(
                              f => f !== fileName
                            )
                          );
                        }
                      }}
                      size="small"
                    />
                  }
                  label={
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700
                      }}
                    >
                      📄 {fileName}
                    </span>
                  }
                />
              );
            })}
          </FormGroup>

          <div style={{ marginTop: '20px' }}>
            <FormControl fullWidth size="small">
              <InputLabel shrink>
                Download Format
              </InputLabel>

              <Select
                value={downloadFormat}
                label="Download Format"
                onChange={(e) =>
                  setDownloadFormat(e.target.value)
                }
              >
                <MenuItem value="csv">
                  CSV (.csv)
                </MenuItem>

                <MenuItem value="xlsx">
                  Excel (.xlsx)
                </MenuItem>

                <MenuItem value="json">
                  JSON (.json)
                </MenuItem>
              </Select>
            </FormControl>
          </div>

          <div style={{ marginTop: '10px' }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={includeOriginalInDownload}
                  onChange={(e) =>
                    setIncludeOriginalInDownload(
                      e.target.checked
                    )
                  }
                />
              }
              label={
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  Include Original Data
                </span>
              }
            />
          </div>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setDownloadModalOpen(false)
            }
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={handleLocalDownload}
            disabled={
              selectedFilesToDownload.length === 0
            }
            style={{
              background:
                'linear-gradient(135deg,#10B981,#059669)'
            }}
          >
            Download Selected (
            {selectedFilesToDownload.length}
            )
          </Button>
        </DialogActions>
      </Dialog>

      {/* SIMPLIFIED EXPORT MODAL RESTORING FULL S3 SELECTOR WITHOUT CREATE BUCKET */}
      <Dialog
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle className="font-bold text-xs flex items-center" style={{ color: '#1E293B' }}>
          <DownloadIcon className="mr-1 text-indigo-600" fontSize="small" /> Source-Locked Export Destination
        </DialogTitle>
        <DialogContent className="space-y-2.5 pt-1">
          <FormGroup className="space-y-1 max-h-28 overflow-y-auto border p-1.5 rounded" style={{ backgroundColor: '#E3EBFA', borderColor: '#CBD5E1' }}>
            {(activeDataset ? [activeDataset] : []).map(fileName => {
              const isChecked = selectedFilesToDownload.includes(fileName);
              return (
                <FormControlLabel
                  key={fileName}
                  control={
                    <Checkbox
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedFilesToDownload([...selectedFilesToDownload, fileName]);
                        else setSelectedFilesToDownload(selectedFilesToDownload.filter(f => f !== fileName));
                      }}
                      size="small"
                      color="primary"
                    />
                  }
                  label={<span className="text-[11px] font-bold" style={{ color: '#1E293B' }}>📄 {fileName}</span>}
                />
              );
            })}
          </FormGroup>

          <div className="space-y-1">
            <Typography className="text-[10px] font-bold text-slate-700">Locked Extraction Destination:</Typography>
            {(() => {
              const workspaceMeta = savedWorkspace[activeDataset] || {};
              const origDb = (workspaceMeta.originalDb || "").toLowerCase();
              
              if (origDb.includes("snowflake")) {
                return <div className="text-[10px] text-indigo-600 font-bold p-2 bg-indigo-50 rounded">🔒 Locked to Snowflake (Mirroring database TEST_DATA_DB)</div>;
              } else if (origDb.includes("postgres")) {
                return <div className="text-[10px] text-emerald-600 font-bold p-2 bg-emerald-50 rounded">🔒 Locked to PostgreSQL (Mirroring database test_db)</div>;
              } else if (origDb.includes("mysql")) {
                return <div className="text-[10px] text-cyan-600 font-bold p-2 bg-cyan-50 rounded">🔒 Locked to MySQL (Mirroring database test_db)</div>;
              } else if (origDb.includes("s3") || origDb.includes("aws")) {
                return (
                  <div className="space-y-2 p-2 border rounded bg-slate-50 border-slate-200 text-[10px]">
                    <div className="text-[10px] text-amber-600 font-bold">🔒 Locked to Amazon S3 Bucket</div>
                    {!awsLoggedIn ? (
                      <>
                        <input type="text" placeholder="AWS Access Key ID" value={s3ExportCreds.accessKeyId} onChange={e => setS3ExportCreds({ ...s3ExportCreds, accessKeyId: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }} />
                        <input type="password" placeholder="AWS Secret Access Key" value={s3ExportCreds.secretAccessKey} onChange={e => setS3ExportCreds({ ...s3ExportCreds, secretAccessKey: e.target.value })} style={{ width: '100%', fontSize: '10px', padding: '4px', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B', marginTop: '4px' }} />
                        <button onClick={() => handleFetchAwsBuckets(s3ExportCreds)} disabled={loadingAwsBuckets} style={{ width: '100%', padding: '5px', background: '#2563EB', color: '#FFF', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '4px' }}>
                          {loadingAwsBuckets ? "Connecting..." : "Login & Load Buckets"}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="text-emerald-700 font-bold text-[10px]">✅ Connected to AWS S3</div>
                        <select value={selectedAwsBucket} onChange={e => handleSelectAwsBucket(e.target.value)} style={{ width: '100%', fontSize: '10px', padding: '4px', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B' }}>
                          <option value="">-- Choose S3 Bucket --</option>
                          {awsBuckets.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>

                        {selectedAwsBucket && (
                          <select value={selectedAwsFolder} onChange={e => setSelectedAwsFolder(e.target.value)} style={{ width: '100%', fontSize: '10px', padding: '4px', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#1E293B', marginTop: '4px' }}>
                            <option value="(Root)">📁 (Root / No folder)</option>
                            {awsFolders.map(f => <option key={f} value={f}>📁 {f}</option>)}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                );
              } else {
                return <div className="text-[10px] text-red-600 font-bold p-2 bg-red-50 rounded">⚠️ Local/URL datasets cannot be exported to cloud/databases.</div>;
              }
            })()}
          </div>
        </DialogContent>
        <DialogActions className="p-2">
          <Button onClick={() => setExportModalOpen(false)} color="inherit" className="text-[10px]" style={{ color: '#64748B' }}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmMultiDownload}
            variant="contained"
            disabled={selectedFilesToDownload.length === 0 || (extractionTarget === 'aws' && (!awsLoggedIn || !selectedAwsBucket)) || loading}
            className="font-bold text-[10px]"
            style={{ background: 'linear-gradient(135deg, #4F46E5, #06B6D4)', color: '#FFFFFF', boxShadow: 'none' }}
          >
            {loading ? "Exporting..." : "Confirm Source-Locked Export"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}