import json
import sys
from pathlib import Path

from docx import Document


def clean(value: str) -> str:
    return "\n".join(part.strip() for part in value.replace("\r", "").split("\n") if part.strip())


def main() -> None:
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    document = Document(source)
    rows = []
    for table_index, table in enumerate(document.tables):
        for row_index, row in enumerate(table.rows, start=1):
            cells = [clean(cell.text) for cell in row.cells]
            rows.append({"table": table_index, "row": row_index, "cells": cells})
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"extracted {len(rows)} rows to {output}")


if __name__ == "__main__":
    main()
