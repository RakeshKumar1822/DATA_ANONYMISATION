import os
import duckdb
import polars as pl
from pathlib import Path

# Workspace storage directory
STORAGE_DIR = Path(__file__).resolve().parent.parent.parent / "storage"
STORAGE_DIR.mkdir(exist_ok=True)

DB_PATH = STORAGE_DIR / "workspace.duckdb"

def get_duckdb_conn():
    """Returns a DuckDB connection attached to workspace storage."""
    return duckdb.connect(str(DB_PATH))

def save_df_to_parquet(df: pl.DataFrame, dataset_name: str) -> str:
    """
    Saves a Polars DataFrame to disk as compressed Parquet and registers
    a SQL View inside DuckDB for sub-second pagination queries.
    """
    parquet_path = STORAGE_DIR / f"{dataset_name}.parquet"
    df.write_parquet(parquet_path, compression="snappy")
    
    conn = get_duckdb_conn()
    conn.execute(f"CREATE OR REPLACE VIEW '{dataset_name}' AS SELECT * FROM read_parquet('{parquet_path}')")
    conn.close()
    return str(parquet_path)

def get_parquet_path(dataset_name: str) -> Path:
    return STORAGE_DIR / f"{dataset_name}.parquet"