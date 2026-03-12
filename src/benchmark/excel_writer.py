from io import BytesIO

from openpyxl import Workbook

from src.benchmark.runner import BenchmarkRow


def write_benchmark_excel(rows: list[BenchmarkRow]) -> BytesIO:
    wb = Workbook()
    ws = wb.active
    ws.title = "Benchmark"

    headers = [
        "Query",
        "Patient ID",
        "Strategy",
        "Model",
        "Response",
        "Tokens In",
        "Tokens Out",
        "Latency (ms)",
        "Resource Types Used",
        "Expected Resource Types",
        "Error",
    ]
    ws.append(headers)

    for row in rows:
        ws.append(
            [
                row.query,
                row.patient_id,
                row.strategy,
                row.model,
                row.response,
                row.tokens_in,
                row.tokens_out,
                row.latency_ms,
                ", ".join(getattr(row, "resource_types", []) or []),
                ", ".join(getattr(row, "expected_resource_types", []) or []),
                row.error or "",
            ]
        )

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
