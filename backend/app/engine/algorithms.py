import polars as pl
import string
import hashlib
import re
import datetime

DEFAULT_SEED = 2026

# ==============================================================================
# 1. CHARACTER & STRINGS POOLS DEFINITIONS
# ==============================================================================
UPPER_ALPHABET = list(string.ascii_uppercase)
LOWER_ALPHABET = list(string.ascii_lowercase)
DIGITS_POOL = list(string.digits)

DOMAINS_POOL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "mail.com", "icloud.com", "protonmail.com"]

CONSONANTS = ["b", "c", "d", "f", "g", "h", "k", "l", "m", "n", "p", "r", "s", "t", "v", "y", "z", "ch", "sh"]
VOWELS = ["a", "e", "i", "o", "u", "an", "al", "ar", "ia"]
C_KEYS = list(range(len(CONSONANTS)))
V_KEYS = list(range(len(VOWELS)))

DATE_FORMATS = [
    "%d-%m-%Y", "%m-%d-%Y", "%Y-%m-%d",
    "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d",
    "%d-%m-%y", "%m-%d-%y",
    "%d.%m.%Y", "%m.%d.%Y",
    "%b-%d-%Y", "%b/%d/%Y", "%d-%b-%Y"
]

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^[+]?[\d\-\s()]{7,15}$")
_NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?$")

# ==============================================================================
# 2. INNER HELPER ENTROPY & MASKING METHODS
# ==============================================================================
def calculate_md5_hash_string(val: str) -> str:
    if val is None:
        val = "NULL"
    return hashlib.md5(val.encode("utf-8")).hexdigest()

def _get_string_entropy_expr(expr: pl.Expr, salt: str, seed: int) -> pl.Expr:
    cleaned = expr.cast(pl.String).str.strip_chars().fill_null("NULL")
    return (cleaned + pl.lit(salt) + pl.lit(str(seed))).hash(seed=seed)

def _get_string_hash(str_expr: pl.Expr, seed: int = DEFAULT_SEED) -> pl.Expr:
    return str_expr.cast(pl.String).fill_null("NULL").hash(seed=seed)

def _generate_first_name_from_expr(expr: pl.Expr, seed: int = DEFAULT_SEED) -> pl.Expr:
    h = _get_string_hash(expr, seed=seed)
    return (
        (h % len(CONSONANTS)).cast(pl.Int64).replace_strict(C_KEYS, CONSONANTS, default=None) +
        ((h + 1) % len(VOWELS)).cast(pl.Int64).replace_strict(V_KEYS, VOWELS, default=None) +
        ((h + 2) % len(CONSONANTS)).cast(pl.Int64).replace_strict(C_KEYS, CONSONANTS, default=None) +
        ((h + 3) % len(VOWELS)).cast(pl.Int64).replace_strict(V_KEYS, VOWELS, default=None)
    ).str.to_titlecase()

def _generate_last_name_from_expr(expr: pl.Expr, seed: int = DEFAULT_SEED) -> pl.Expr:
    h = _get_string_hash(expr, seed=seed)
    return (
        ((h + 5) % len(CONSONANTS)).cast(pl.Int64).replace_strict(C_KEYS, CONSONANTS, default=None) +
        ((h + 6) % len(VOWELS)).cast(pl.Int64).replace_strict(V_KEYS, VOWELS, default=None) +
        ((h + 7) % len(CONSONANTS)).cast(pl.Int64).replace_strict(C_KEYS, CONSONANTS, default=None) +
        pl.lit("ur")
    ).str.to_titlecase()

def _generate_exact_full_name_from_expr(expr: pl.Expr, seed: int = DEFAULT_SEED) -> pl.Expr:
    tokens = expr.cast(pl.String).str.replace_all(r"\s+", " ").str.strip_chars().str.split(" ")
    return tokens.list.eval(
        pl.when(pl.element().cum_count() == pl.element().count())
        .then(_generate_last_name_from_expr(pl.element(), seed))
        .otherwise(_generate_first_name_from_expr(pl.element(), seed))
    ).list.join(" ")

def rebuild_with_format(original_value: str, replacement_digits: str) -> str:
    if original_value is None or original_value == "":
        return None
    rebuilt = []
    digit_idx = 0
    for ch in original_value:
        if ch.isdigit():
            if digit_idx < len(replacement_digits):
                rebuilt.append(replacement_digits[digit_idx])
                digit_idx += 1
            else:
                rebuilt.append(ch)
        else:
            rebuilt.append(ch)
    return "".join(rebuilt)

# ==============================================================================
# 3. HIGH-VELOCITY VECTORIZED EMAIL GENERATION INNER MODULE
# ==============================================================================
def _vectorized_email_masker(
    col_expr: pl.Expr,
    seed: int,
    match_names: bool = False,
    rules_dict: dict = None,
    active_table: str = "",
    df_cols: list = None
) -> pl.Expr:
    entropy = _get_string_entropy_expr(col_expr, "FabricEmailMasking2026_v1", seed)
    domain_idx = (entropy % len(DOMAINS_POOL)).cast(pl.Int64)
    domain_str = domain_idx.replace_strict(list(range(len(DOMAINS_POOL))), DOMAINS_POOL, default=DOMAINS_POOL[0])

    if match_names and rules_dict and active_table and df_cols:
        fn_col, ln_col, full_col = None, None, None
        for c in df_cols:
            rk = f"{active_table}|{c}"
            algo = rules_dict.get(rk, {}).get("algo", "")
            if algo in ["First Name", "FIRSTNAME"] and not fn_col:
                fn_col = c
            elif algo in ["Last Name", "LASTNAME"] and not ln_col:
                ln_col = c
            elif algo in ["Full Name", "FULLNAME"] and not full_col:
                full_col = c

        first_expr, last_expr = None, None
        if fn_col:
            first_expr = _generate_first_name_from_expr(pl.col(fn_col), seed).str.to_lowercase()
        if ln_col:
            last_expr = _generate_last_name_from_expr(pl.col(ln_col), seed).str.to_lowercase()
        elif full_col:
            tokens = pl.col(full_col).cast(pl.String).str.replace_all(r"\s+", " ").str.strip_chars().str.split(" ")
            first_expr = _generate_first_name_from_expr(tokens.list.get(0), seed).str.to_lowercase()
            last_expr = _generate_last_name_from_expr(tokens.list.get(-1), seed).str.to_lowercase()

        if first_expr is not None and last_expr is not None:
            return first_expr + pl.lit(".") + last_expr + pl.lit("@") + domain_str
        elif first_expr is not None:
            return first_expr + pl.lit("@") + domain_str

    u_h = entropy.hash(seed=seed)
    u_part1 = (u_h % len(CONSONANTS)).cast(pl.Int64).replace_strict(C_KEYS, CONSONANTS, default=None)
    u_part2 = ((u_h + 1) % len(VOWELS)).cast(pl.Int64).replace_strict(V_KEYS, VOWELS, default=None)
    u_part3 = ((u_h + 2) % len(CONSONANTS)).cast(pl.Int64).replace_strict(C_KEYS, CONSONANTS, default=None)
    u_num = ((u_h % 899) + 100).cast(pl.String)
    username = u_part1 + u_part2 + u_part3 + u_num

    return username + pl.lit("@") + domain_str

# ==============================================================================
# 4. PHONE NUMBER MASKING
# ==============================================================================
def _mask_single_phone_with_formatting(original_val, seed: int, normalize_phone: bool = False, keep_anomalies: bool = False) -> str:
    if original_val is None:
        return None
    phone_str = str(original_val).strip()
    if phone_str == "" or phone_str.lower() in {"none", "null", "<null>"}:
        return None
    clean_digits = re.sub(r"[^0-9]", "", phone_str)

    if keep_anomalies:
        if not (_PHONE_RE.match(phone_str) and 7 <= len(clean_digits) <= 15):
            return phone_str

    def local_digits_hash(val: str, digit_count: int) -> str:
        hashed = hashlib.md5((val + "FabricPhoneMasking2026_v1" + str(seed)).encode("utf-8")).hexdigest()
        entropy_val = int(hashed[:15], 16)
        return str(entropy_val % (10 ** digit_count)).zfill(digit_count)

    def local_fallback_mobile(val: str) -> str:
        hashed = hashlib.md5((val + "FabricPhoneMasking2026_v1" + str(seed)).encode("utf-8")).hexdigest()
        entropy_val = int(hashed[:15], 16)
        first_digit = str((entropy_val % 4) + 6)
        suffix_digits = str((entropy_val // 10) % 1000000000).zfill(9)
        return first_digit + suffix_digits

    if clean_digits in {"100", "101", "108", "112", "1930", "155260"}:
        return phone_str

    if clean_digits.startswith("1800") or clean_digits.startswith("1860"):
        if len(clean_digits) >= 7:
            suffix_len = len(clean_digits) - 4
            replacement = clean_digits[:4] + local_digits_hash(clean_digits, suffix_len)
            return replacement if normalize_phone else rebuild_with_format(phone_str, replacement)

    if clean_digits.startswith("140") or clean_digits.startswith("160"):
        if len(clean_digits) >= 6:
            suffix_len = len(clean_digits) - 3
            replacement = clean_digits[:3] + local_digits_hash(clean_digits, suffix_len)
            return replacement if normalize_phone else rebuild_with_format(phone_str, replacement)

    std_codes = ["08564", "0866", "0861", "0870", "0877", "040", "022", "033", "044", "080", "020", "079"]
    matched_std = None
    for std in sorted(std_codes, key=len, reverse=True):
        if clean_digits.startswith(std):
            matched_std = std
            break

    if matched_std is not None and len(clean_digits) > len(matched_std):
        suffix_len = len(clean_digits) - len(matched_std)
        replacement = matched_std + local_digits_hash(clean_digits, suffix_len)
        return replacement if normalize_phone else rebuild_with_format(phone_str, replacement)

    normalized_mobile = None
    mobile_prefix_style = None

    if len(clean_digits) == 13 and clean_digits.startswith("091") and clean_digits[3] in "6789":
        normalized_mobile = clean_digits[3:]
        mobile_prefix_style = "091"
    elif len(clean_digits) == 12 and clean_digits.startswith("91") and clean_digits[2] in "6789":
        normalized_mobile = clean_digits[2:]
        mobile_prefix_style = "91"
    elif len(clean_digits) == 11 and clean_digits.startswith("0") and clean_digits[1] == "9" and clean_digits[2] in "6789":
        normalized_mobile = clean_digits[1:]
        mobile_prefix_style = "0"
    elif len(clean_digits) == 10 and clean_digits[0] in "6789":
        normalized_mobile = clean_digits
        mobile_prefix_style = ""

    if normalized_mobile is not None:
        masked_mobile = normalized_mobile[0] + local_digits_hash(normalized_mobile, 9)
        if normalize_phone:
            return masked_mobile
        else:
            if mobile_prefix_style == "091": replacement = "091" + masked_mobile
            elif mobile_prefix_style == "91": replacement = "91" + masked_mobile
            elif mobile_prefix_style == "0": replacement = "0" + masked_mobile
            else: replacement = masked_mobile
            return rebuild_with_format(phone_str, replacement)

    return local_fallback_mobile(phone_str)

def _vectorized_phone_masker(col_expr: pl.Expr, seed: int, normalize_phone: bool = False, keep_anomalies: bool = False) -> pl.Expr:
    return (
        pl.when(
            col_expr.is_null()
            | (col_expr.cast(pl.String).str.strip_chars() == "")
            | (col_expr.cast(pl.String).str.to_lowercase() == "none")
            | (col_expr.cast(pl.String).str.to_lowercase() == "null")
        )
        .then(None)
        .otherwise(
            col_expr.map_elements(
                lambda v, s=seed, np=normalize_phone, ka=keep_anomalies: _mask_single_phone_with_formatting(v, s, np, ka),
                return_dtype=pl.String
            )
        )
    )

# ==============================================================================
# 5. DATE MASKING
# ==============================================================================
def detect_value_date_format(value: str):
    if value is None:
        return None
    v = str(value).strip()
    if v == "" or v.lower() in ("none", "null"):
        return None
    for fmt in DATE_FORMATS:
        try:
            datetime.datetime.strptime(v, fmt)
            return fmt
        except ValueError:
            continue
    return None

def detect_column_date_formats(values) -> list:
    found = set()
    for v in values:
        if v is None:
            continue
        s = str(v).strip()
        if s == "" or s.lower() in ("none", "null"):
            continue
        fmt = detect_value_date_format(s)
        found.add(fmt if fmt else "UNKNOWN")
    return sorted(found)

def _mask_date_value(value, seed: int, unify_format: bool, target_format: str = "%d-%m-%Y"):
    if value is None:
        return None
    s = str(value).strip()
    if s == "" or s.lower() in ("none", "null"):
        return None

    matched_fmt = detect_value_date_format(s)
    h = int(hashlib.md5((s + "DateMasking2026_v1" + str(seed)).encode("utf-8")).hexdigest(), 16)

    out_fmt = target_format if unify_format or not matched_fmt else matched_fmt

    if matched_fmt is None:
        if not unify_format:
            return s
        else:
            fallback_date = datetime.date(1985, 1, 1) + datetime.timedelta(days=h % 12000)
            return fallback_date.strftime(out_fmt)

    try:
        parsed_date = datetime.datetime.strptime(s, matched_fmt).date()
        raw_mod = h % 372
        shift_days = (raw_mod - 365) if raw_mod < 186 else ((raw_mod - 186) + 180)
        new_date = parsed_date + datetime.timedelta(days=shift_days)
    except ValueError:
        if not unify_format:
            return s
        new_date = datetime.date(1985, 1, 1) + datetime.timedelta(days=h % 12000)

    return new_date.strftime(out_fmt)

# ==============================================================================
# 6. UNIVERSAL COLUMN ANOMALY INSPECTOR
# ==============================================================================
def inspect_column_datatype_anomalies(df: pl.DataFrame, col: str, algo: str) -> tuple[list, bool]:
    try:
        sample_vals = df[col].drop_nulls().head(2000).cast(pl.Utf8, strict=False).to_list()
        cleaned = [str(v).strip() for v in sample_vals if v is not None and str(v).strip() not in ("", "none", "null")]
        if not cleaned:
            return [], False

        clean_algo = algo.upper().replace(" ", "").replace("-", "")

        if any(k in clean_algo for k in ["DATE", "DOB"]):
            formats_found = detect_column_date_formats(cleaned)
            clean_fmts = [f for f in formats_found if f != "UNKNOWN"]
            has_multiple_formats = len(clean_fmts) > 1 or "UNKNOWN" in formats_found
            return formats_found, has_multiple_formats

        elif any(k in clean_algo for k in ["NUMBER", "NUMERICAL", "BUCKET"]):
            non_numeric_types = set()
            for v in cleaned:
                if not _NUMERIC_RE.match(v):
                    non_numeric_types.add("Text String")
            if non_numeric_types:
                return list(non_numeric_types) + ["Numeric"], True
            return ["Numeric"], False

        elif "EMAIL" in clean_algo:
            invalid = sum(1 for v in cleaned if not _EMAIL_RE.match(v)) > 0
            return (["Non-Standard Email", "Standard Email"], True) if invalid else (["Standard Email"], False)

        elif any(k in clean_algo for k in ["PHONE", "CONTACT"]):
            def _digits(v): return sum(ch.isdigit() for ch in v)
            non_phone_count = sum(1 for v in cleaned if not (_PHONE_RE.match(v) and 7 <= _digits(v) <= 15))
            has_anomalies = non_phone_count > 0
            detected_types = []
            if has_anomalies:
                detected_types.append("Text/Mixed Data")
            detected_types.append("Phone Format")
            return detected_types, has_anomalies

        return [], False
    except Exception:
        return [], False

# ==============================================================================
# 7. CORE VECTORIZED EXPRESSION ROUTER
# ==============================================================================
def get_vectorized_expression(
    col: str,
    algo: str,
    seed: int = DEFAULT_SEED,
    match_names: bool = False,
    df_cols: list = None,
    normalize_phone: bool = False,
    unify_date_format: bool = True,
    target_date_format: str = "%d-%m-%Y",
    keep_anomalies: bool = False,
    rules_dict: dict = None,
    active_table: str = ""
) -> pl.Expr:
    algo_clean = re.sub(r"[^A-Z]", "", str(algo).upper())
    col_expr = pl.col(col)

    is_null_or_empty = col_expr.is_null() | (col_expr.cast(pl.String).str.strip_chars() == "")

    if algo_clean in ["FIRSTNAME", "NAMEFIRST", "FIRSTNAMEANONYMIZATION"]:
        return pl.when(is_null_or_empty).then(None).otherwise(_generate_first_name_from_expr(col_expr, seed))

    elif algo_clean in ["LASTNAME", "NAMELAST", "LASTNAMEANONYMIZATION"]:
        return pl.when(is_null_or_empty).then(None).otherwise(_generate_last_name_from_expr(col_expr, seed))

    elif algo_clean in ["FULLNAME", "NAMEFULL", "FULLNAMEANONYMIZATION"]:
        return pl.when(is_null_or_empty).then(None).otherwise(_generate_exact_full_name_from_expr(col_expr, seed))

    elif algo_clean in ["NUMBER", "NUMERICAL", "NUMBERS"]:
        is_empty_or_null = (
            col_expr.is_null() |
            (col_expr.cast(pl.String).str.strip_chars() == "") |
            (col_expr.cast(pl.String).str.to_lowercase() == "none") |
            (col_expr.cast(pl.String).str.to_lowercase() == "null")
        )
        safe_col = pl.when(is_empty_or_null).then(None).otherwise(col_expr)
        amt_str = safe_col.cast(pl.String).str.strip_chars()
        amt_double = safe_col.cast(pl.Float64, strict=False)

        dec_places = (
            pl.when(amt_str.str.contains(r"\."))
            .then(amt_str.str.split(".").list.get(1, null_on_oob=True).str.len_chars().fill_null(0))
            .otherwise(0)
        )

        abs_amount = amt_double.abs()
        digit_len = pl.when(abs_amount < 1).then(4).otherwise(abs_amount.floor().cast(pl.Int64).cast(pl.String).str.len_chars())
        lower_bound = 10 ** (digit_len - 1)
        upper_bound = (10 ** digit_len) - 1
        entropy = _get_string_entropy_expr(safe_col, "FabricAmountMasking2026_v1", seed)
        rand_float = (entropy % 100000000) / 100000000.0
        gen_int = (lower_bound + (rand_float * (upper_bound - lower_bound + 1)).floor()).cast(pl.Int64)
        dec_multiplier = 10 ** dec_places
        gen_dec = pl.when(dec_places > 0).then((entropy * 17) % dec_multiplier).otherwise(0)
        gen_amt = pl.when(dec_places > 0).then(gen_int + (gen_dec / dec_multiplier)).otherwise(gen_int.cast(pl.Float64))
        final_amt = pl.when(amt_double < 0).then(-gen_amt).otherwise(gen_amt)

        masked_res = pl.when(is_empty_or_null).then(None).otherwise(final_amt)
        if keep_anomalies:
            return pl.when(amt_double.is_null() & (~is_empty_or_null)).then(col_expr).otherwise(masked_res)
        return masked_res

    elif algo_clean == "EMAIL":
        masked_email = pl.when(col_expr.is_null()).then(None).otherwise(
            _vectorized_email_masker(
                col_expr, seed,
                match_names=match_names,
                rules_dict=rules_dict,
                active_table=active_table,
                df_cols=df_cols
            )
        )
        if keep_anomalies:
            is_valid_email = col_expr.cast(pl.String).str.contains(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
            return pl.when(is_valid_email.not_() & (~is_null_or_empty)).then(col_expr).otherwise(masked_email)
        return masked_email

    elif algo_clean in ["PHONENUMBER", "CONTACT", "PHONENUMBERANONYMIZATION"]:
        return (
            pl.when(is_null_or_empty)
            .then(None)
            .otherwise(_vectorized_phone_masker(col_expr, seed, normalize_phone=normalize_phone, keep_anomalies=keep_anomalies))
        )

    elif algo_clean == "ALPHANUMERIC":
        str_expr = col_expr.cast(pl.String).fill_null("NULL")
        masked_expr = (
            str_expr.str.split("")
            .list.eval(
                pl.element().hash(seed=seed)
                .pipe(lambda h:
                    pl.when(pl.element().str.contains(r"[A-Z]")).then(pl.lit(UPPER_ALPHABET).list.get((h % 26).cast(pl.UInt32)))
                    .when(pl.element().str.contains(r"[a-z]")).then(pl.lit(LOWER_ALPHABET).list.get((h % 26).cast(pl.UInt32)))
                    .when(pl.element().str.contains(r"[0-9]")).then(pl.lit(DIGITS_POOL).list.get((h % 10).cast(pl.UInt32)))
                    .otherwise(pl.element())
                )
            ).list.join("")
        )
        return pl.when(col_expr.is_null()).then(None).otherwise(masked_expr)

    elif algo_clean in ["DATETYPE", "DOB", "DATE"]:
        return (
            pl.when(is_null_or_empty)
            .then(None)
            .otherwise(
                col_expr.map_elements(
                    lambda v, s=seed, u=unify_date_format, fmt=target_date_format: _mask_date_value(
                        v, seed=s, unify_format=(u if not keep_anomalies else False), target_format=fmt
                    ),
                    return_dtype=pl.String
                )
            )
        )

    elif algo_clean in ["BUCKETBASED", "BUCKET"]:
        val_expr = col_expr.cast(pl.Float64, strict=False).abs()
        min_v = col_expr.cast(pl.Float64, strict=False).abs().min()
        max_v = col_expr.cast(pl.Float64, strict=False).abs().max()

        range_span = pl.when((max_v - min_v) <= 0.0).then(10.0).otherwise(max_v - min_v)
        tier_width = (range_span / 10.0).ceil()

        tier_id = ((val_expr - min_v) / tier_width).floor()
        tier_start = (min_v + (tier_id * tier_width)).fill_null(0.0)
        tier_end = pl.min_horizontal([tier_start + tier_width - 1.0, max_v]).fill_null(0.0)

        tier_size = (tier_end - tier_start + 1.0).cast(pl.Int64)
        tier_size_safe = pl.when(tier_size <= 0).then(1).otherwise(tier_size)

        entropy = _get_string_entropy_expr(col_expr, "FabricBucketMasking2026_v1", seed)
        safe_offset = (entropy % tier_size_safe.cast(pl.UInt64)).cast(pl.Int64)
        candidate = tier_start.cast(pl.Int64) + safe_offset

        masked_val = pl.when(candidate == val_expr.cast(pl.Int64)).then(
            pl.when(tier_size_safe > 1).then(
                tier_start.cast(pl.Int64) + ((safe_offset + 1) % tier_size_safe)
            ).otherwise(candidate)
        ).otherwise(candidate)

        res = pl.when(col_expr.is_null() | val_expr.is_null()).then(None).otherwise(masked_val.cast(pl.Int64).cast(pl.String))
        if keep_anomalies:
            return pl.when(val_expr.is_null() & (~is_null_or_empty)).then(col_expr).otherwise(res)
        return res

    return col_expr

def infer_field_datatype(sample_values) -> str:
    cleaned = [str(v).strip() for v in sample_values if v is not None and str(v).strip() != ""]
    if not cleaned:
        return "Text"
    total = len(cleaned)
    if sum(1 for v in cleaned if _EMAIL_RE.match(v)) / total >= 0.7:
        return "Email"
    if sum(1 for v in cleaned if detect_value_date_format(v) is not None) / total >= 0.7:
        return "Date"
    numeric_count = sum(1 for v in cleaned if _NUMERIC_RE.match(v))
    if numeric_count / total >= 0.7:
        return "Number"
    return "Text"