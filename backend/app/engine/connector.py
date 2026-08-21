from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from io import BytesIO
import io

import pandas as pd
import polars as pl

# ============================================================
# OPTIONAL DATABASE & CLOUD DRIVERS
# ============================================================

try:
    import pymysql
except ImportError:
    pymysql = None

try:
    import psycopg2
except ImportError:
    psycopg2 = None

try:
    import snowflake.connector as snowflake_connector
    from snowflake.connector.pandas_tools import write_pandas
except ImportError:
    snowflake_connector = None
    write_pandas = None

try:
    import pyodbc
except ImportError:
    pyodbc = None

try:
    import boto3
except ImportError:
    boto3 = None


# ============================================================
# CONSTANTS & METADATA
# ============================================================

SUPPORTED_DRIVERS = {
    "mysql": "MySQL",
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "snowflake": "Snowflake",
    "sqlserver": "SQL Server",
    "sql_server": "SQL Server",
    "mssql": "SQL Server",
}

SYSTEM_DATABASES = {
    "mysql": {
        "information_schema",
        "performance_schema",
        "mysql",
        "sys",
    },
    "postgresql": {
        "template0",
        "template1",
        "rdsadmin",
    },
    "snowflake": {
        "SNOWFLAKE",
        "SNOWFLAKE_SAMPLE_DATA",
        "INFORMATION_SCHEMA",
    },
}


# ============================================================
# CONFIGURATION DATACLASS
# ============================================================

@dataclass
class DBConfig:
    driver: str
    host: Optional[str] = None
    port: Optional[int] = None
    user: Optional[str] = None
    password: Optional[str] = None
    database: Optional[str] = None
    schema: Optional[str] = None
    account: Optional[str] = None
    warehouse: Optional[str] = None
    role: Optional[str] = None
    ssl: bool = False
    connect_timeout: int = 15
    query_timeout: int = 30


# ============================================================
# NORMALIZATION & VALIDATION
# ============================================================

def normalize_driver(driver: str) -> str:
    if not driver:
        raise ValueError("Database driver is required.")
    normalized = str(driver).strip().lower()
    if normalized not in SUPPORTED_DRIVERS:
        raise ValueError(
            f"Unsupported database driver '{driver}'. "
            f"Supported drivers: {', '.join(sorted(set(SUPPORTED_DRIVERS.values())))}"
        )
    return normalized


def validate_identifier(value: str, field_name: str = "identifier") -> str:
    if value is None:
        raise ValueError(f"{field_name} is required.")
    value = str(value).strip()
    if not value:
        raise ValueError(f"{field_name} cannot be empty.")
    if not re.fullmatch(r"[A-Za-z0-9_$.\-]+", value):
        raise ValueError(
            f"Invalid {field_name}: '{value}'. "
            "Only letters, numbers, _, -, $, and . are allowed."
        )
    return value


def normalize_config(config: DBConfig) -> DBConfig:
    config.driver = normalize_driver(config.driver)
    if config.port is not None:
        try:
            config.port = int(config.port)
        except Exception:
            raise ValueError("Port must be a valid integer.")
    if config.connect_timeout <= 0:
        config.connect_timeout = 15
    if config.query_timeout <= 0:
        config.query_timeout = 30
    return config


# ============================================================
# CONNECTION FACTORIES
# ============================================================

def create_mysql_connection(config: DBConfig):
    if pymysql is None:
        raise RuntimeError("PyMySQL is not installed. Install it using: pip install PyMySQL")
    config = normalize_config(config)
    kwargs = {
        "host": config.host,
        "port": config.port or 3306,
        "user": config.user,
        "password": config.password,
        "connect_timeout": config.connect_timeout,
        "read_timeout": config.query_timeout,
        "write_timeout": config.query_timeout,
        "charset": "utf8mb4",
        "autocommit": True,
    }
    if config.database:
        kwargs["database"] = validate_identifier(config.database, "database")
    return pymysql.connect(**kwargs)


def create_snowflake_connection(config: DBConfig):
    if snowflake_connector is None:
        raise RuntimeError("Snowflake connector is not installed. Install it using: pip install snowflake-connector-python[pandas]")
    config = normalize_config(config)
    kwargs = {
        "account": config.account,
        "user": config.user,
        "password": config.password,
        "login_timeout": config.connect_timeout,
        "network_timeout": config.query_timeout,
        "autocommit": True,
        "ocsp_fail_open": True,
    }
    if config.warehouse:
        kwargs["warehouse"] = config.warehouse
    if config.database:
        kwargs["database"] = config.database
    if config.schema:
        kwargs["schema"] = config.schema
    if config.role:
        kwargs["role"] = config.role
    return snowflake_connector.connect(**kwargs)


# ============================================================
# TEST CONNECTION & DISCOVERY
# ============================================================

def test_connection(config: DBConfig) -> Tuple[bool, str, List[str]]:
    conn = None
    try:
        config = normalize_config(config)
        if config.driver == "mysql":
            conn = create_mysql_connection(config)
            with conn.cursor() as cursor:
                cursor.execute("SHOW DATABASES")
                rows = cursor.fetchall()
            databases = [row[0] for row in rows if row[0] not in SYSTEM_DATABASES["mysql"]]
            return True, "MySQL connection successful!", databases

        elif config.driver == "snowflake":
            conn = create_snowflake_connection(config)
            cursor = conn.cursor()
            try:
                cursor.execute("SHOW DATABASES")
                rows = cursor.fetchall()
                databases = []
                for row in rows:
                    if len(row) > 1:
                        db_name = row[1]
                        if db_name not in SYSTEM_DATABASES["snowflake"]:
                            databases.append(db_name)
            finally:
                cursor.close()
            return True, "Snowflake connection successful!", databases

        return False, f"Unsupported driver: {config.driver}", []

    except Exception as e:
        return False, format_connection_error(config.driver, e), []
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


# ============================================================
# TABLE & SCHEMA DISCOVERY & DATA FETCHING
# ============================================================

def get_mysql_tables(config: DBConfig) -> List[str]:
    conn = create_mysql_connection(config)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SHOW TABLES")
            return [row[0] for row in cursor.fetchall()]
    finally:
        conn.close()


def get_snowflake_schemas(config: DBConfig) -> List[str]:
    conn = create_snowflake_connection(config)
    cursor = conn.cursor()
    try:
        if config.database:
            cursor.execute(f"USE DATABASE {validate_identifier(config.database, 'database')}")
        cursor.execute("SHOW SCHEMAS")
        return [row[1] for row in cursor.fetchall() if len(row) > 1 and row[1] not in ("INFORMATION_SCHEMA",)]
    except Exception:
        return ["PUBLIC"]
    finally:
        cursor.close()
        conn.close()


def get_snowflake_tables(config: DBConfig) -> List[str]:
    conn = create_snowflake_connection(config)
    cursor = conn.cursor()
    try:
        db_name = None
        if config.database:
            db_name = validate_identifier(config.database, "database")
            cursor.execute(f"USE DATABASE {db_name}")
            
        schema_name = validate_identifier(config.schema or "PUBLIC", "schema").upper()
        cursor.execute(f"USE SCHEMA {schema_name}")
        
        cursor.execute("SHOW TABLES")
        tables = [row[1] for row in cursor.fetchall() if len(row) > 1]
        
        if not tables and db_name:
            cursor.execute(f"""
                SELECT TABLE_NAME 
                FROM {db_name}.INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = '{schema_name}'
            """)
            tables = [row[0] for row in cursor.fetchall()]
            
        return tables
    except Exception:
        return []
    finally:
        cursor.close()
        conn.close()


def fetch_table_to_polars(config: DBConfig, table: str, limit: Optional[int] = 1000) -> pl.DataFrame:
    config = normalize_config(config)
    table = validate_identifier(table, "table")
    
    if config.driver == "mysql":
        conn = create_mysql_connection(config)
        try:
            query = f"SELECT * FROM `{table}`"
            if limit:
                query += f" LIMIT {int(limit)}"
            pdf = pd.read_sql(query, conn)
            return pl.from_pandas(pdf, include_index=False)
        finally:
            conn.close()

    elif config.driver == "snowflake":
        conn = create_snowflake_connection(config)
        database = validate_identifier(config.database, "database")
        schema = validate_identifier(config.schema or "PUBLIC", "schema")
        cursor = conn.cursor()
        try:
            query = f'SELECT * FROM "{database}"."{schema}"."{table}"'
            if limit:
                query += f" LIMIT {int(limit)}"
            cursor.execute(query)
            pdf = cursor.fetch_pandas_all()
            return pl.from_pandas(pdf, include_index=False)
        finally:
            cursor.close()
            conn.close()
            
    raise ValueError(f"Driver {config.driver} table fetch not implemented.")


# ============================================================
# SNOWFLAKE WRITE-BACK / EXPORT HANDLER ('TEST_DATA_DB')
# ============================================================

def upload_dataframe_to_snowflake_test_db(
    config: DBConfig, 
    original_database: str, 
    schema_name: str, 
    table_name: str, 
    dataframe_dicts: List[Dict[str, Any]],
    force_external_schema: bool = False
):
    if snowflake_connector is None:
        raise RuntimeError("Snowflake connector is not installed.")
    
    config = normalize_config(config)
    
    target_db = "TEST_DATA_DB"
    target_schema = "EXTERNAL_FILES" if force_external_schema else (schema_name or "PUBLIC").strip('"').upper()
    target_table = (table_name or "DATASET").strip('"').upper()

    conn = create_snowflake_connection(config)
    cursor = conn.cursor()
    try:
        if config.warehouse:
            try:
                cursor.execute(f'USE WAREHOUSE "{config.warehouse}";')
            except Exception:
                pass

        cursor.execute(f'CREATE DATABASE IF NOT EXISTS "{target_db}";')
        cursor.execute(f'USE DATABASE "{target_db}";')

        cursor.execute(f'CREATE SCHEMA IF NOT EXISTS "{target_schema}";')
        cursor.execute(f'USE SCHEMA "{target_schema}";')

        df = pl.DataFrame(dataframe_dicts)
        columns = [str(c).upper() for c in df.columns]
        
        cursor.execute(f'DROP TABLE IF EXISTS "{target_table}";')
        
        col_defs = ", ".join([f'"{col}" VARCHAR' for col in columns])
        cursor.execute(f'CREATE TABLE "{target_table}" ({col_defs});')

        rows = df.to_dicts()
        if rows:
            batch_size = 500
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                placeholders = []
                bind_values = []
                for row in batch:
                    vals = [row.get(c) for c in df.columns]
                    placeholders.append("(" + ", ".join(["%s" for _ in vals]) + ")")
                    bind_values.extend([str(v) if v is not None else None for v in vals])
                
                cols_str = ", ".join([f'"{c}"' for c in columns])
                insert_query = f'INSERT INTO "{target_table}" ({cols_str}) VALUES ' + ", ".join(placeholders)
                cursor.execute(insert_query, bind_values)

        return True, f"Successfully stored {len(rows)} rows in `{target_db}`.`{target_schema}`.`{target_table}`!"
    except Exception as e:
        raise RuntimeError(f"Snowflake Re-upload Execution Failed: {str(e)}")
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if conn:
            conn.close()


# ============================================================
# AMAZON S3 CONNECTOR & STREAMING FUNCTIONS
# ============================================================

def get_s3_client(aws_access_key_id: Optional[str] = None, aws_secret_access_key: Optional[str] = None, region_name: str = "us-east-1"):
    if boto3 is None:
        raise RuntimeError("boto3 is not installed. Install it using: pip install boto3")
    if aws_access_key_id and aws_secret_access_key:
        return boto3.client(
            's3',
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            region_name=region_name
        )
    return boto3.client('s3', region_name=region_name)


def fetch_dataset_from_s3(bucket: str, key: str, aws_access_key_id: Optional[str] = None, aws_secret_access_key: Optional[str] = None, region_name: str = "us-east-1") -> pl.DataFrame:
    s3 = get_s3_client(aws_access_key_id, aws_secret_access_key, region_name)
    response = s3.get_object(Bucket=bucket, Key=key)
    file_bytes = response['Body'].read()
    
    if key.endswith('.csv'):
        return pl.read_csv(BytesIO(file_bytes))
    elif key.endswith('.parquet'):
        return pl.read_parquet(BytesIO(file_bytes))
    elif key.endswith('.xlsx') or key.endswith('.xls'):
        pdf = pd.read_excel(io.BytesIO(file_bytes))
        return pl.from_pandas(pdf, include_index=False)
    else:
        raise ValueError("Unsupported file extension in S3. Please use .csv, .parquet, or .xlsx")


def export_dataset_to_s3(df: pl.DataFrame, bucket: str, destination_key: str, format: str = "csv", aws_access_key_id: Optional[str] = None, aws_secret_access_key: Optional[str] = None, region_name: str = "us-east-1"):
    s3 = get_s3_client(aws_access_key_id, aws_secret_access_key, region_name)
    buffer = BytesIO()
    
    fmt = format.lower()
    if fmt == "csv":
        df.write_csv(buffer)
        content_type = "text/csv"
    elif fmt == "json":
        df.write_json(buffer)
        content_type = "application/json"
    elif fmt == "xlsx":
        df.to_pandas().to_excel(buffer, index=False)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        raise ValueError("Unsupported export format for S3.")
        
    buffer.seek(0)
    s3.put_object(Bucket=bucket, Key=destination_key, Body=buffer.getvalue(), ContentType=content_type)
    return True


def list_s3_buckets_and_folders(aws_access_key_id: Optional[str] = None, aws_secret_access_key: Optional[str] = None, region_name: str = "us-east-1", bucket: Optional[str] = None) -> Dict[str, Any]:
    s3 = get_s3_client(aws_access_key_id, aws_secret_access_key, region_name)
    if not bucket:
        response = s3.list_buckets()
        buckets = [b['Name'] for b in response.get('Buckets', [])]
        return {"buckets": buckets}
    else:
        response = s3.list_objects_v2(Bucket=bucket, Delimiter='/')
        folders = [prefix['Prefix'].rstrip('/') for prefix in response.get('CommonPrefixes', [])]
        return {"folders": folders}


# ============================================================
# ERROR HANDLING
# ============================================================

def format_connection_error(driver: str, error: Exception) -> str:
    error_text = str(error).strip() or "Unknown database error."
    lower_error = error_text.lower()

    if "localhost" in lower_error or "127.0.0.1" in lower_error or "refused" in lower_error or "2003" in lower_error:
        return (
            f"Connection failed: Unable to reach {driver} on 'localhost'. "
            "Because this app is running live on Render, 'localhost' points to Render's cloud container, "
            "not your laptop. Please use a public cloud database host (like Aiven for MySQL) "
            "or upload your files directly using the Local Files uploader."
        )
    return f"{driver} connection failed: {error_text}"


# ============================================================
# CONVENIENCE DICT API WRAPPERS
# ============================================================

def build_config_from_dict(data: Dict[str, Any]) -> DBConfig:
    driver = data.get("driver") or data.get("db_type")
    if not driver:
        if data.get("account") or data.get("warehouse") or data.get("sf_account"):
            driver = "snowflake"
        else:
            driver = "mysql"

    return DBConfig(
        driver=driver,
        host=data.get("host"),
        port=data.get("port"),
        user=data.get("user") or data.get("username"),
        password=data.get("password") or data.get("pass"),
        database=data.get("database") or data.get("db") or data.get("selected_database"),
        schema=data.get("schema") or data.get("db_schema") or data.get("selected_schema") or "PUBLIC",
        account=data.get("account") or data.get("sf_account"),
        warehouse=data.get("warehouse") or data.get("sf_warehouse") or data.get("wh"),
        role=data.get("role") or data.get("sf_role"),
        ssl=bool(data.get("ssl", False)),
        connect_timeout=int(data.get("connect_timeout", 15)),
        query_timeout=int(data.get("query_timeout", 30)),
    )

def test_connection_from_dict(data: Dict[str, Any]) -> Tuple[bool, str, List[str]]:
    return test_connection(build_config_from_dict(data))