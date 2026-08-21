from __future__ import annotations

import os
import re
import io
import zipfile
import requests
import traceback
from typing import Dict, Optional, List, Any

import pandas as pd
import polars as pl
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.db import save_df_to_parquet, get_duckdb_conn, get_parquet_path
from app.engine.pipeline import load_file_to_dataframe, run_anonymization_engine, convert_dataframe_to_bytes
from app.engine.connector import (
    DBConfig,
    test_connection,
    get_mysql_tables,
    get_snowflake_schemas,
    get_snowflake_tables,
    fetch_table_to_polars,
    upload_dataframe_to_snowflake_test_db,
    build_config_from_dict,
    fetch_dataset_from_s3,
    export_dataset_to_s3,
    list_s3_buckets_and_folders
)

app = FastAPI(title="DataEase Provisioning Engine", version="3.19")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RuleConfig(BaseModel):
    algo: str = "None"
    case: str = "Original Case"
    consistent: bool = True
    match_name: bool = False
    preserve_format: bool = True
    target_date_format: str = "%d-%m-%Y"
    unify_date_format: bool = True
    keep_anomalies: bool = False

class AnonymizeRequest(BaseModel):
    dataset_name: str
    rules: Dict[str, RuleConfig]
    seed: Optional[int] = 2026

class MultiExportRequest(BaseModel):
    dataset_names: List[str]
    rules_map: Dict[str, Dict[str, RuleConfig]]
    format: str = "csv"
    include_original: bool = False
    seed: Optional[int] = 2026

class GenericConnectReq(BaseModel):
    driver: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    user: Optional[str] = None
    password: Optional[str] = None
    database: Optional[str] = None
    db_schema: Optional[str] = Field(default="PUBLIC", alias="schema")
    account: Optional[str] = None
    warehouse: Optional[str] = None
    role: Optional[str] = None

    class Config:
        populate_by_name = True

class GenericSchemaReq(GenericConnectReq):
    database: str

    class Config:
        populate_by_name = True

class GenericTableReq(GenericConnectReq):
    database: str
    db_schema: Optional[str] = Field(default="PUBLIC", alias="schema")

    class Config:
        populate_by_name = True

class GenericImportReq(GenericConnectReq):
    database: Optional[str] = None
    db_schema: Optional[str] = Field(default="PUBLIC", alias="schema")
    table: Optional[str] = None
    custom_dataset_name: Optional[str] = None
    action: Optional[str] = "import"
    dataframe_dicts: Optional[List[Dict[str, Any]]] = None
    force_external_schema: Optional[bool] = False

    class Config:
        populate_by_name = True

class UrlFetchReq(BaseModel):
    url: str
    custom_dataset_name: Optional[str] = None

class S3FetchReq(BaseModel):
    bucket: str
    key: str
    region_name: str = "us-east-1"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    custom_dataset_name: Optional[str] = None

class S3ExportReq(BaseModel):
    dataset_name: str
    bucket: str
    destination_key: str
    format: str = "csv"
    region_name: str = "us-east-1"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    rules: Optional[Dict[str, RuleConfig]] = None
    seed: Optional[int] = 2026

class S3BucketsReq(BaseModel):
    region_name: str = "us-east-1"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None

class S3FoldersReq(BaseModel):
    bucket: str
    region_name: str = "us-east-1"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None


def clean_filename(name: str) -> str:
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    clean = clean.replace(" ", "_").strip("_")
    return clean or "cloud_dataset"

def fetch_cloud_url_data(raw_url: str) -> tuple[bytes, str]:
    clean_url = raw_url.strip()
    
    if "docs.google.com/spreadsheets" in clean_url:
        sheet_id_match = re.search(r'/spreadsheets/d/([a-zA-Z0-9_-]+)', clean_url)
        if sheet_id_match:
            sheet_id = sheet_id_match.group(1)
            clean_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"

    elif "github.com" in clean_url and "/blob/" in clean_url:
        clean_url = clean_url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
    }

    try:
        res = requests.get(clean_url, headers=headers, timeout=30, allow_redirects=True)
        res.raise_for_status()
    except requests.exceptions.RequestException as e:
        raise ValueError(f"Failed to connect to URL: {str(e)}")

    content = res.content
    snippet = content[:200].lower()

    if b"<!doctype html>" in snippet or b"<html" in snippet or b"<head>" in snippet:
        if "drive.google.com" in clean_url:
            file_id_match = re.search(r'/file/d/([a-zA-Z0-9_-]+)', clean_url) or re.search(r'id=([a-zA-Z0-9_-]+)', clean_url)
            if file_id_match:
                file_id = file_id_match.group(1)
                direct_url = f"https://drive.google.com/uc?export=download&id={file_id}"
                res = requests.get(direct_url, headers=headers, timeout=30, allow_redirects=True)
                if b"<!doctype html>" not in res.content[:200].lower():
                    parsed_name = clean_url.split("/")[-1].split("?")[0] or "gdrive_dataset.csv"
                    return res.content, clean_filename(parsed_name)

        raise ValueError("The link returned a webpage/HTML viewer instead of raw data. Please provide a direct download link.")

    parsed_filename = clean_url.split("/")[-1].split("?")[0] or "url_dataset.csv"
    if "." not in parsed_filename:
        parsed_filename += ".csv"

    return content, clean_filename(parsed_filename)


@app.get("/api")
@app.get("/")
async def root():
    return {"status": "online", "message": "Backend engine is running successfully"}

@app.post("/api/ingest/file")
async def ingest_file(file: UploadFile = File(...), override_name: Optional[str] = None):
    try:
        content = await file.read()
        target_name = override_name if override_name else os.path.splitext(file.filename)[0]
        dataset_name = clean_filename(target_name)
        
        df = load_file_to_dataframe(content, file.filename)
        save_df_to_parquet(df, dataset_name)
        
        return {
            "status": "success", 
            "dataset_name": dataset_name, 
            "rows": df.height, 
            "columns": df.columns
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/connect/databases")
@app.post("/api/connect/mysql/databases")
@app.post("/api/connect/snowflake/databases")
async def get_databases(req: GenericConnectReq):
    try:
        data = req.model_dump(by_alias=True)
        if data.get("account") or "." in str(data.get("account", "")):
            data["driver"] = "snowflake"
        elif not data.get("driver"):
            data["driver"] = "mysql"
            
        config = build_config_from_dict(data)
        success, msg, dbs = test_connection(config)
        if not success:
            raise HTTPException(status_code=400, detail=msg)
        return {"message": msg, "databases": dbs}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/connect/schemas")
@app.post("/api/connect/mysql/schemas")
@app.post("/api/connect/snowflake/schemas")
async def get_schemas(req: GenericSchemaReq):
    try:
        data = req.model_dump(by_alias=True)
        if data.get("account") or data.get("warehouse") or data.get("driver") == "snowflake":
            data["driver"] = "snowflake"
        
        config = build_config_from_dict(data)
        schemas = get_snowflake_schemas(config) if config.driver == "snowflake" else ["PUBLIC"]
        return {"schemas": schemas}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/connect/tables")
@app.post("/api/connect/mysql/tables")
@app.post("/api/connect/snowflake/tables")
async def get_tables(req: GenericTableReq):
    try:
        data = req.model_dump(by_alias=True)
        if data.get("account") or data.get("warehouse") or data.get("driver") == "snowflake":
            data["driver"] = "snowflake"
        elif not data.get("driver"):
            data["driver"] = "mysql"
            
        config = build_config_from_dict(data)
        tables = get_snowflake_tables(config) if config.driver == "snowflake" else get_mysql_tables(config)
        return {"tables": tables}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/connect/import")
@app.post("/api/connect/mysql/import")
@app.post("/api/connect/snowflake/import")
async def import_table(req: GenericImportReq):
    try:
        data = req.model_dump(by_alias=True)
        table_name = data.get("table")
        custom_name = data.get("custom_dataset_name")
        action = data.get("action", "import")
        dataframe_dicts = data.get("dataframe_dicts")
        force_external_schema = data.get("force_external_schema", False)

        if data.get("account") or data.get("warehouse") or data.get("driver") == "snowflake":
            data["driver"] = "snowflake"
        elif not data.get("driver"):
            data["driver"] = "mysql"

        config = build_config_from_dict(data)
        database_name = config.database
        schema_name = config.schema or "PUBLIC"

        if action == "extract_test_db":
            if not dataframe_dicts:
                raise ValueError("No dataset rows provided for extraction.")
            try:
                success, msg = upload_dataframe_to_snowflake_test_db(
                    config=config,
                    original_database=database_name,
                    schema_name=schema_name,
                    table_name=table_name,
                    dataframe_dicts=dataframe_dicts,
                    force_external_schema=force_external_schema
                )
                return {"status": "success", "message": msg}
            except Exception as upload_err:
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=f"Snowflake Re-upload Failed: {str(upload_err)}")

        df = fetch_table_to_polars(config, table_name)
        target_name = custom_name if custom_name else f"{database_name}_{schema_name}_{table_name}"
        dataset_name = clean_filename(target_name)
        
        save_df_to_parquet(df, dataset_name)
        return {
            "status": "success", 
            "dataset_name": dataset_name, 
            "rows": df.height, 
            "columns": df.columns
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/ingest/url")
async def ingest_from_url(req: UrlFetchReq):
    try:
        file_bytes, parsed_filename = fetch_cloud_url_data(req.url)
        target_name = req.custom_dataset_name if req.custom_dataset_name else os.path.splitext(parsed_filename)[0]
        dataset_name = clean_filename(target_name)
        
        df = load_file_to_dataframe(file_bytes, parsed_filename)
        save_df_to_parquet(df, dataset_name)
        
        return {
            "status": "success", 
            "dataset_name": dataset_name, 
            "rows": df.height, 
            "columns": df.columns
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/ingest/s3")
async def ingest_from_s3(req: S3FetchReq):
    try:
        df = fetch_dataset_from_s3(
            bucket=req.bucket,
            key=req.key,
            aws_access_key_id=req.aws_access_key_id,
            aws_secret_access_key=req.aws_secret_access_key,
            region_name=req.region_name
        )
        base_name = req.key.split('/')[-1].split('.')[0]
        target_name = req.custom_dataset_name if req.custom_dataset_name else base_name
        dataset_name = clean_filename(target_name)

        save_df_to_parquet(df, dataset_name)
        return {
            "status": "success",
            "dataset_name": dataset_name,
            "rows": df.height,
            "columns": df.columns
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/ingest/s3/buckets")
async def get_s3_buckets(req: S3BucketsReq):
    try:
        res = list_s3_buckets_and_folders(
            aws_access_key_id=req.aws_access_key_id,
            aws_secret_access_key=req.aws_secret_access_key,
            region_name=req.region_name
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/ingest/s3/folders")
async def get_s3_folders(req: S3FoldersReq):
    try:
        res = list_s3_buckets_and_folders(
            aws_access_key_id=req.aws_access_key_id,
            aws_secret_access_key=req.aws_secret_access_key,
            region_name=req.region_name,
            bucket=req.bucket
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/export/s3")
async def export_to_s3(req: S3ExportReq):
    try:
        parquet_path = get_parquet_path(req.dataset_name)
        if not parquet_path.exists():
            raise HTTPException(status_code=404, detail="Dataset not found in workspace.")

        df = pl.read_parquet(parquet_path)
        
        if req.rules:
            rules_converted = {k: v.model_dump() if hasattr(v, "model_dump") else v for k, v in req.rules.items()}
            df = run_anonymization_engine(df, rules_converted, seed=req.seed or 2026, dataset_name=req.dataset_name)

        export_dataset_to_s3(
            df=df,
            bucket=req.bucket,
            destination_key=req.destination_key,
            format=req.format,
            aws_access_key_id=req.aws_access_key_id,
            aws_secret_access_key=req.aws_secret_access_key,
            region_name=req.region_name
        )
        return {
            "status": "success",
            "message": f"Successfully exported fully anonymized dataset '{req.dataset_name}' to s3://{req.bucket}/{req.destination_key}"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/preview/{dataset_name}")
async def preview_dataset(dataset_name: str, page: int = 1, limit: int = 100):
    try:
        offset = (page - 1) * limit
        conn = get_duckdb_conn()
        total_rows = conn.execute(f"SELECT COUNT(*) FROM '{dataset_name}'").fetchone()[0]
        query = f"SELECT * FROM '{dataset_name}' LIMIT {limit} OFFSET {offset}"
        df_page = pl.from_arrow(conn.execute(query).fetch_record_batch())
        conn.close()
        return {"total_rows": total_rows, "page": page, "limit": limit, "data": df_page.to_dicts()}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Dataset not found: {str(e)}")

@app.post("/api/anonymize/preview")
async def preview_anonymization(req: AnonymizeRequest, page: int = 1, limit: int = 100):
    try:
        parquet_path = get_parquet_path(req.dataset_name)
        if not parquet_path.exists():
            raise HTTPException(status_code=404, detail="Dataset not found")

        lazy_df = pl.scan_parquet(parquet_path)
        offset = (page - 1) * limit
        slice_df = lazy_df.slice(offset, limit).collect()
        rules_converted = {k: v.model_dump() for k, v in req.rules.items()}
        anonymized_df = run_anonymization_engine(slice_df, rules_converted, seed=req.seed or 2026, dataset_name=req.dataset_name)

        return {"page": page, "limit": limit, "data": anonymized_df.to_dicts()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/export/multi")
async def export_multi_package(req: MultiExportRequest):
    zip_buffer = io.BytesIO()
    fmt = req.format.lower()
    ext = "xlsx" if fmt in ["xlsx", "excel"] else fmt

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for ds_name in req.dataset_names:
            parquet_path = get_parquet_path(ds_name)
            if not parquet_path.exists():
                continue

            df = pl.read_parquet(parquet_path)
            rules_for_ds = req.rules_map.get(ds_name, {})
            rules_converted = {k: v.model_dump() if hasattr(v, "model_dump") else v for k, v in rules_for_ds.items()}
            
            anon_df = run_anonymization_engine(df, rules_converted, seed=req.seed or 2026, dataset_name=ds_name)
            anon_bytes = convert_dataframe_to_bytes(anon_df, fmt)
            zip_file.writestr(f"anonymized_{ds_name}.{ext}", anon_bytes)

            if req.include_original:
                orig_bytes = convert_dataframe_to_bytes(df, fmt)
                zip_file.writestr(f"original_{ds_name}.{ext}", orig_bytes)

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=anonymized_datasets_package.zip"}
    )