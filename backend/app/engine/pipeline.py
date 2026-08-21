from __future__ import annotations

import io
import polars as pl
from app.engine.algorithms import get_vectorized_expression

def load_file_to_dataframe(file_bytes: bytes, file_name: str) -> pl.DataFrame:
    """Dynamically parses CSV, Excel, Parquet, JSON, TSV into a string-preserved Polars DataFrame."""
    ext = file_name.lower().split('.')[-1] if '.' in file_name else ""
    buffer = io.BytesIO(file_bytes)

    try:
        if ext in ["xlsx", "xls", "xlsm", "xlsb"]:
            try:
                return pl.read_excel(buffer, engine="fastexcel", infer_schema_length=0)
            except Exception:
                return pl.read_excel(buffer, engine="openpyxl")
        elif ext == "parquet":
            return pl.read_parquet(buffer)
        elif ext in ["ipc", "feather"]:
            return pl.read_ipc(buffer)
        elif ext == "json":
            try:
                return pl.read_json(buffer)
            except Exception:
                buffer.seek(0)
                return pl.read_ndjson(buffer)
        elif ext in ["tsv", "tab"]:
            return pl.read_csv(buffer, separator="\t", infer_schema_length=0)
        else:
            try:
                return pl.read_csv(buffer, infer_schema_length=0)
            except Exception:
                buffer.seek(0)
                return pl.read_csv(buffer, separator=";", infer_schema_length=0)
    except Exception as e:
        raise ValueError(f"Could not parse file '{file_name}': {str(e)}")

def run_anonymization_engine(df: pl.DataFrame, configuration_rules: dict, seed: int = 2026, dataset_name: str = "") -> pl.DataFrame:
    """Applies vectorized masking expressions in parallel across all configured columns."""
    expressions = []
    
    for column in df.columns:
        rule = configuration_rules.get(column, {"algo": "None"})
        
        if isinstance(rule, dict):
            algo = rule.get("algo", "None")
            case = rule.get("case", "Original Case")
            preserve_fmt = rule.get("preserve_format", True)
            match_name = rule.get("match_name", False)
            target_date_format = rule.get("target_date_format", "%d-%m-%Y")
            unify_date_format = rule.get("unify_date_format", True)
            keep_anomalies = rule.get("keep_anomalies", False)
        else:
            algo = str(rule)
            case = "Original Case"
            preserve_fmt = True
            match_name = False
            target_date_format = "%d-%m-%Y"
            unify_date_format = True
            keep_anomalies = False

        if algo != "None":
            normalize_phone = (algo.upper() == "PHONE NUMBER" or algo.upper() == "CONTACT") and not preserve_fmt
            
            expr = get_vectorized_expression(
                col=column, 
                algo=algo, 
                seed=seed, 
                match_names=match_name,
                df_cols=df.columns,
                normalize_phone=normalize_phone,
                unify_date_format=unify_date_format,
                target_date_format=target_date_format,
                keep_anomalies=keep_anomalies,
                rules_dict=configuration_rules,
                active_table=dataset_name
            )
            
            if any(k in algo.upper() for k in ["NAME", "EMAIL", "ALPHANUMERIC"]):
                if case == "UPPERCASE":
                    expr = expr.str.to_uppercase()
                elif case == "lowercase":
                    expr = expr.str.to_lowercase()
                elif case == "Title Case":
                    expr = expr.str.to_titlecase()
                    
            expressions.append(expr.alias(column))
        else:
            expressions.append(pl.col(column))
            
    return df.select(expressions)

def convert_dataframe_to_bytes(df: pl.DataFrame, target_format: str) -> bytes:
    """Encodes the final anonymized DataFrame into binary file format."""
    fmt = target_format.lower()
    buffer = io.BytesIO()
    if fmt == "csv":
        df.write_csv(buffer)
    elif fmt in ["xlsx", "excel"]:
        df.write_excel(buffer)
    elif fmt == "json":
        df.write_json(buffer)
    buffer.seek(0)
    return buffer.getvalue()