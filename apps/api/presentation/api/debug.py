import io
from fastapi import APIRouter, UploadFile, File
from datetime import datetime
from decimal import Decimal, InvalidOperation

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.post("/parse-all-tables")
async def parse_all_tables(file: UploadFile = File(...)):
    """Parse ALL tables on ALL pages using the FIXED logic."""
    import pdfplumber

    data = await file.read()

    def try_parse_date(date_str: str) -> bool:
        if not date_str:
            return False
        date_str = str(date_str).strip()
        formats = ["%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d.%m.%Y"]
        for fmt in formats:
            try:
                datetime.strptime(date_str, fmt)
                return True
            except ValueError:
                continue
        return False

    def parse_cl_amount(amount_str: str) -> Decimal:
        return Decimal(amount_str.replace(".", ""))

    all_charges = []

    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page_num, page in enumerate(pdf.pages):
            tables = page.extract_tables()

            for table_idx, table in enumerate(tables):
                for row_idx, row in enumerate(table):
                    if not row or len(row) < 2:
                        continue

                    first_cell_str = str(row[0]).strip().lower() if row[0] else ""
                    if first_cell_str in ("lugar", "fecha", "descripción", "periodo", "estado de cuenta", ""):
                        continue

                    # Find date
                    fecha_cell = None
                    for col_idx in range(len(row)):
                        cell = row[col_idx]
                        if not cell:
                            continue
                        cell_str = str(cell).strip()
                        first_line = cell_str.split("\n")[0].strip()
                        if try_parse_date(first_line):
                            fecha_cell = cell
                            break

                    if not fecha_cell:
                        continue

                    # Find description: PRIORITIZE col 2
                    desc_cell = None
                    if len(row) > 2 and row[2]:
                        cell_str = str(row[2]).strip()
                        if cell_str.lower() not in ("descripción", "description", "monto", "cargo", "total", "operación", ""):
                            if not try_parse_date(cell_str.split("\n")[0].strip()):
                                clean = cell_str.replace("$", "").replace(".", "").replace("-", "").replace(",", "").strip()
                                if not (clean and clean.isdigit()):
                                    desc_cell = row[2]

                    if not desc_cell:
                        for col_idx in range(len(row)):
                            if col_idx <= 1:
                                continue
                            if not row[col_idx]:
                                continue
                            if row[col_idx] == fecha_cell:
                                continue
                            cell_str = str(row[col_idx]).strip()
                            if cell_str.lower() in ("descripción", "description", "monto", "cargo", "total", "operación", ""):
                                continue
                            if try_parse_date(cell_str.split("\n")[0].strip()):
                                continue
                            clean = cell_str.replace("$", "").replace(".", "").replace("-", "").replace(",", "").strip()
                            if clean and clean.isdigit():
                                continue
                            desc_cell = row[col_idx]
                            break

                    if not desc_cell:
                        continue

                    # Find amount
                    monto_cell = None
                    for col_idx in range(len(row)):
                        if not row[col_idx]:
                            continue
                        if row[col_idx] == fecha_cell or row[col_idx] == desc_cell:
                            continue
                        cell_str = str(row[col_idx]).strip()
                        if cell_str.startswith("$"):
                            monto_cell = row[col_idx]
                            break
                        clean = cell_str.replace("$", "").replace(".", "").replace("-", "").replace(",", "").strip()
                        if clean and clean.isdigit():
                            monto_cell = row[col_idx]
                            break

                    if not monto_cell:
                        continue

                    # Extract transactions
                    fecha_lines = str(fecha_cell).split("\n")
                    desc_lines = str(desc_cell).split("\n")
                    monto_lines = str(monto_cell).split("\n")

                    max_lines = max(len(fecha_lines), len(desc_lines), len(monto_lines))

                    for line_idx in range(max_lines):
                        fecha_str = fecha_lines[line_idx].strip() if line_idx < len(fecha_lines) else ""
                        desc_str = desc_lines[line_idx].strip() if line_idx < len(desc_lines) else ""
                        monto_str = monto_lines[line_idx].strip() if line_idx < len(monto_lines) else ""

                        if not fecha_str or not desc_str or not monto_str:
                            continue

                        if desc_str.lower() in ("descripción", "description", "descripcion", "desc", "monto", "cargo", "total", "operación"):
                            continue

                        parsed_date = None
                        for fmt in ["%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d.%m.%Y"]:
                            try:
                                parsed_date = datetime.strptime(fecha_str, fmt).date()
                                break
                            except ValueError:
                                continue

                        if not parsed_date:
                            continue

                        try:
                            monto_clean = monto_str.replace("$", "").strip()
                            amount = parse_cl_amount(monto_clean)
                        except (InvalidOperation, ValueError):
                            continue

                        all_charges.append({
                            "page": page_num + 1,
                            "table": table_idx,
                            "row": row_idx,
                            "date": str(parsed_date),
                            "description": desc_str,
                            "amount": str(amount),
                        })

    return {
        "total_extracted": len(all_charges),
        "charges": sorted(all_charges, key=lambda x: x["date"])
    }

@router.post("/inspect-page")
async def inspect_page(file: UploadFile = File(...), page_num: int = 2):
    """Inspect a specific page to see what tables are detected and their contents."""
    import pdfplumber

    data = await file.read()

    with pdfplumber.open(io.BytesIO(data)) as pdf:
        if page_num < 1 or page_num > len(pdf.pages):
            return {"error": f"Page {page_num} does not exist. PDF has {len(pdf.pages)} pages."}

        page = pdf.pages[page_num - 1]
        tables = page.extract_tables()

        if not tables:
            return {
                "page": page_num,
                "tables_found": 0,
                "error": "No tables detected on this page"
            }

        result = {
            "page": page_num,
            "tables_found": len(tables),
            "tables": []
        }

        for table_idx, table in enumerate(tables):
            table_info = {
                "table_idx": table_idx,
                "rows": len(table),
                "columns": len(table[0]) if table else 0,
                "header": table[0] if table else None,
                "sample_rows": table[1:min(4, len(table))] if len(table) > 1 else []
            }
            result["tables"].append(table_info)

        return result


@router.post("/parse-page-2-full")
async def parse_page_2_full(file: UploadFile = File(...)):
    """Parse page 2 PERIODO ACTUAL table with full logic - designed for July charges."""
    import pdfplumber

    data = await file.read()

    def try_parse_date(date_str: str) -> bool:
        if not date_str:
            return False
        date_str = str(date_str).strip()
        formats = ["%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d.%m.%Y"]
        for fmt in formats:
            try:
                datetime.strptime(date_str, fmt)
                return True
            except ValueError:
                continue
        return False

    def parse_cl_amount(amount_str: str) -> Decimal:
        return Decimal(amount_str.replace(".", ""))

    all_charges = []

    with pdfplumber.open(io.BytesIO(data)) as pdf:
        if len(pdf.pages) < 2:
            return {"error": "PDF has less than 2 pages"}

        page = pdf.pages[1]  # Page 2 (index 1)
        tables = page.extract_tables()

        if not tables:
            return {
                "page": 2,
                "tables_found": 0,
                "error": "No tables detected on page 2"
            }

        # Process all tables on page 2
        for table_idx, table in enumerate(tables):
            for row_idx, row in enumerate(table):
                if not row or len(row) < 2:
                    continue

                first_cell_str = str(row[0]).strip().lower() if row[0] else ""
                if first_cell_str in ("lugar", "fecha", "descripción", "periodo", "estado de cuenta", ""):
                    continue

                # Find date
                fecha_cell = None
                for col_idx in range(len(row)):
                    cell = row[col_idx]
                    if not cell:
                        continue
                    cell_str = str(cell).strip()
                    first_line = cell_str.split("\n")[0].strip()
                    if try_parse_date(first_line):
                        fecha_cell = cell
                        break

                if not fecha_cell:
                    continue

                # Find description: PRIORITIZE col 2
                desc_cell = None
                if len(row) > 2 and row[2]:
                    cell_str = str(row[2]).strip()
                    if cell_str.lower() not in ("descripción", "description", "monto", "cargo", "total", "operación", ""):
                        if not try_parse_date(cell_str.split("\n")[0].strip()):
                            clean = cell_str.replace("$", "").replace(".", "").replace("-", "").replace(",", "").strip()
                            if not (clean and clean.isdigit()):
                                desc_cell = row[2]

                if not desc_cell:
                    for col_idx in range(len(row)):
                        if col_idx <= 1:
                            continue
                        if not row[col_idx]:
                            continue
                        if row[col_idx] == fecha_cell:
                            continue
                        cell_str = str(row[col_idx]).strip()
                        if cell_str.lower() in ("descripción", "description", "monto", "cargo", "total", "operación", ""):
                            continue
                        if try_parse_date(cell_str.split("\n")[0].strip()):
                            continue
                        clean = cell_str.replace("$", "").replace(".", "").replace("-", "").replace(",", "").strip()
                        if clean and clean.isdigit():
                            continue
                        desc_cell = row[col_idx]
                        break

                if not desc_cell:
                    continue

                # Find amount
                monto_cell = None
                for col_idx in range(len(row)):
                    if not row[col_idx]:
                        continue
                    if row[col_idx] == fecha_cell or row[col_idx] == desc_cell:
                        continue
                    cell_str = str(row[col_idx]).strip()
                    if cell_str.startswith("$"):
                        monto_cell = row[col_idx]
                        break
                    clean = cell_str.replace("$", "").replace(".", "").replace("-", "").replace(",", "").strip()
                    if clean and clean.isdigit():
                        monto_cell = row[col_idx]
                        break

                if not monto_cell:
                    continue

                # Extract transactions
                fecha_lines = str(fecha_cell).split("\n")
                desc_lines = str(desc_cell).split("\n")
                monto_lines = str(monto_cell).split("\n")

                max_lines = max(len(fecha_lines), len(desc_lines), len(monto_lines))

                for line_idx in range(max_lines):
                    fecha_str = fecha_lines[line_idx].strip() if line_idx < len(fecha_lines) else ""
                    desc_str = desc_lines[line_idx].strip() if line_idx < len(desc_lines) else ""
                    monto_str = monto_lines[line_idx].strip() if line_idx < len(monto_lines) else ""

                    if not fecha_str or not desc_str or not monto_str:
                        continue

                    if desc_str.lower() in ("descripción", "description", "descripcion", "desc", "monto", "cargo", "total", "operación"):
                        continue

                    parsed_date = None
                    for fmt in ["%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d.%m.%Y"]:
                        try:
                            parsed_date = datetime.strptime(fecha_str, fmt).date()
                            break
                        except ValueError:
                            continue

                    if not parsed_date:
                        continue

                    try:
                        monto_clean = monto_str.replace("$", "").strip()
                        amount = parse_cl_amount(monto_clean)
                    except (InvalidOperation, ValueError):
                        continue

                    all_charges.append({
                        "page": 2,
                        "table": table_idx,
                        "row": row_idx,
                        "date": str(parsed_date),
                        "description": desc_str,
                        "amount": str(amount),
                    })

    return {
        "page": 2,
        "total_extracted": len(all_charges),
        "charges": sorted(all_charges, key=lambda x: x["date"])
    }


async def parse_preview_all_rows(file: UploadFile = File(...)):
    """Upload a PDF and see ALL rows with FIXED logic."""
    import pdfplumber

    data = await file.read()
    result = []

    def try_parse_date(date_str: str) -> bool:
        """Check if a string looks like a date"""
        if not date_str:
            return False
        date_str = str(date_str).strip()
        formats = ["%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d.%m.%Y"]
        for fmt in formats:
            try:
                datetime.strptime(date_str, fmt)
                return True
            except ValueError:
                continue
        return False

    def parse_cl_amount(amount_str: str) -> Decimal:
        """Chilean format: dots are thousands separators"""
        return Decimal(amount_str.replace(".", ""))

    with pdfplumber.open(io.BytesIO(data)) as pdf:
        # Focus on page 5 (index 4)
        if len(pdf.pages) > 4:
            page = pdf.pages[4]
            tables = page.extract_tables()

            if tables:
                table = tables[0]  # First table on page 5
                extracted_charges = []

                # Process rows with FIXED logic (prioritize col 2 for description)
                for row_idx, row in enumerate(table):
                    if not row or len(row) < 2:
                        continue

                    # Skip header rows
                    first_cell_str = str(row[0]).strip().lower() if row[0] else ""
                    if first_cell_str in ("lugar", "fecha", "descripción", "periodo", "estado de cuenta", ""):
                        continue

                    # Find date: scan ALL columns
                    fecha_cell = None
                    for col_idx in range(len(row)):
                        cell = row[col_idx]
                        if not cell:
                            continue
                        cell_str = str(cell).strip()
                        first_line = cell_str.split("\n")[0].strip()
                        if try_parse_date(first_line):
                            fecha_cell = cell
                            break

                    if not fecha_cell:
                        continue

                    # Find description: PRIORITIZE col 2 (DESCRIPCIÓN OPERACIÓN O COBRO)
                    desc_cell = None
                    if len(row) > 2 and row[2]:
                        cell_str = str(row[2]).strip()
                        if cell_str.lower() not in ("descripción", "description", "monto", "cargo", "total", "operación", ""):
                            if not try_parse_date(cell_str.split("\n")[0].strip()):
                                clean = cell_str.replace("$", "").replace(".", "").replace("-", "").replace(",", "").strip()
                                if not (clean and clean.isdigit()):
                                    desc_cell = row[2]

                    # If not found in col 2, scan other columns but SKIP col 0 and 1
                    if not desc_cell:
                        for col_idx in range(len(row)):
                            if col_idx <= 1:
                                continue
                            if not row[col_idx]:
                                continue
                            if row[col_idx] == fecha_cell:
                                continue
                            cell_str = str(row[col_idx]).strip()
                            if cell_str.lower() in ("descripción", "description", "monto", "cargo", "total", "operación", ""):
                                continue
                            if try_parse_date(cell_str.split("\n")[0].strip()):
                                continue
                            clean = cell_str.replace("$", "").replace(".", "").replace("-", "").replace(",", "").strip()
                            if clean and clean.isdigit():
                                continue
                            desc_cell = row[col_idx]
                            break

                    if not desc_cell:
                        continue

                    # Find amount
                    monto_cell = None
                    for col_idx in range(len(row)):
                        if not row[col_idx]:
                            continue
                        if row[col_idx] == fecha_cell or row[col_idx] == desc_cell:
                            continue
                        cell_str = str(row[col_idx]).strip()
                        if cell_str.startswith("$"):
                            monto_cell = row[col_idx]
                            break
                        clean = cell_str.replace("$", "").replace(".", "").replace("-", "").replace(",", "").strip()
                        if clean and clean.isdigit():
                            monto_cell = row[col_idx]
                            break

                    if not monto_cell:
                        continue

                    # Extract transactions from multiline cells
                    fecha_lines = str(fecha_cell).split("\n")
                    desc_lines = str(desc_cell).split("\n")
                    monto_lines = str(monto_cell).split("\n")

                    max_lines = max(len(fecha_lines), len(desc_lines), len(monto_lines))

                    for line_idx in range(max_lines):
                        fecha_str = fecha_lines[line_idx].strip() if line_idx < len(fecha_lines) else ""
                        desc_str = desc_lines[line_idx].strip() if line_idx < len(desc_lines) else ""
                        monto_str = monto_lines[line_idx].strip() if line_idx < len(monto_lines) else ""

                        if not fecha_str or not desc_str or not monto_str:
                            continue

                        if desc_str.lower() in ("descripción", "description", "descripcion", "desc", "monto", "cargo", "total", "operación"):
                            continue

                        parsed_date = None
                        for fmt in ["%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d.%m.%Y"]:
                            try:
                                parsed_date = datetime.strptime(fecha_str, fmt).date()
                                break
                            except ValueError:
                                continue

                        if not parsed_date:
                            continue

                        try:
                            monto_clean = monto_str.replace("$", "").strip()
                            amount = parse_cl_amount(monto_clean)
                        except (InvalidOperation, ValueError):
                            continue

                        extracted_charges.append({
                            "date": str(parsed_date),
                            "description": desc_str,
                            "amount": str(amount),
                        })

                return {
                    "page": 5,
                    "table_num": 0,
                    "total_rows": len(table),
                    "total_extracted": len(extracted_charges),
                    "extracted_charges": extracted_charges
                }

    return {"error": "Could not process page 5"}

