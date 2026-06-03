from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent
DASHBOARD_DIR = ROOT / "dashboard"
PIPELINE_SCRIPT = ROOT / "scripts" / "pipeline.py"
DATASET_SCRIPT = ROOT / "scripts" / "build_real_datasets.py"
RUNTIME_LOG: list[dict[str, str]] = []


def append_log(title: str, detail: str) -> None:
    RUNTIME_LOG.insert(0, {"id": f"log-{len(RUNTIME_LOG)+1}", "title": title, "detail": detail})
    del RUNTIME_LOG[20:]


def read_json(path: Path) -> dict | list | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def provider_specs() -> list[dict[str, str | bool]]:
    codex_path = shutil.which("codex") or "/Applications/Codex.app/Contents/Resources/codex"
    specs = [
        {"id": "gemini", "label": "Gemini CLI", "path": shutil.which("gemini") or ""},
        {"id": "claude", "label": "Claude Code", "path": shutil.which("claude") or ""},
        {"id": "codex", "label": "Codex CLI", "path": codex_path if Path(codex_path).exists() else ""},
    ]
    for spec in specs:
        spec["available"] = bool(spec["path"])
    return specs


def latest_outputs() -> tuple[Path, dict | None, dict | None, str]:
    preferred = ROOT / "outputs_source_joern"
    fallback = ROOT / "outputs_source"
    target = preferred if preferred.exists() else fallback
    ranked = read_json(target / "ranked_paths.json")
    validation = read_json(target / "validation.json")
    report = (target / "analysis_report.md").read_text(errors="ignore") if (target / "analysis_report.md").exists() else ""
    return target, ranked, validation, report


def build_state() -> dict[str, object]:
    output_dir, ranked, validation, report = latest_outputs()
    dataset_summary = read_json(ROOT / "data" / "processed" / "dataset_summary.json") or {}
    best = ranked[0] if isinstance(ranked, list) and ranked else {}
    report_preview = " ".join(report.split())[:500] if report else ""

    workflow = [
        {"id": "ingest", "name": "รับไฟล์เข้า", "status": "done", "detail": "ระบบพร้อมรับ source หรือ binary เข้า pipeline", "meta": "sample + datasets พร้อม"},
        {"id": "joern", "name": "Joern CPG", "status": "done" if best.get("origin") == "joern-cpg" else "warn", "detail": "ดึง source-to-sink path จาก CPG และ metadata", "meta": best.get("origin", "unknown")},
        {"id": "binary", "name": "Binary Evidence", "status": "done" if (output_dir / "binary_corroboration.json").exists() else "warn", "detail": "ยืนยันผลจาก binary ด้วย strings/imports/radare2", "meta": "binary corroboration"},
        {"id": "ml", "name": "ML Ranking", "status": "done" if best else "warn", "detail": "ใช้ RandomForest ช่วยจัดอันดับ candidate path", "meta": f"score={best.get('score', '-')}" if best else "-"},
        {"id": "context", "name": "Selective Context", "status": "done" if (output_dir / "context_window.txt").exists() else "warn", "detail": "ตัด code window เฉพาะช่วงที่เสี่ยง", "meta": "context window"},
        {"id": "retrieval", "name": "Knowledge Retrieval", "status": "done" if (output_dir / "retrieved_context.json").exists() else "warn", "detail": "ดึง knowledge base และ write-up มาประกอบ", "meta": "retrieval ready"},
        {"id": "report", "name": "Agent Report", "status": "done" if report else "warn", "detail": "ให้ local agent หรือ fallback สร้าง report สรุป", "meta": "report ready" if report else "no report"},
    ]

    latest_evidence = best.get("source_code", "") if best else ""
    if best.get("sink_code"):
        latest_evidence = f"{latest_evidence} -> {best['sink_code']}".strip()

    return {
        "project": "Hybrid Vulnerability Analysis Demo",
        "metrics": {
            "analyzer": "joern" if best.get("origin") == "joern-cpg" else best.get("origin", "-"),
            "candidateCount": len(ranked) if isinstance(ranked, list) else 0,
        },
        "latestFinding": best,
        "reportPreview": report_preview,
        "datasetSummary": dataset_summary,
        "workflow": workflow,
        "providers": provider_specs(),
        "latestEvidence": latest_evidence or "ยังไม่มีหลักฐานล่าสุด",
        "activityLog": RUNTIME_LOG,
    }


def run_command(command: list[str], cwd: Path | None = None, timeout: int = 600) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd or ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
        env=os.environ.copy(),
        check=False,
    )


def run_analysis(payload: dict[str, object]) -> dict[str, object]:
    sample = str(payload.get("sample", "samples/command_injection_challenge.c"))
    outputs = str(payload.get("outputs", "outputs_source_joern"))
    mode = payload.get("mode")

    command = [sys.executable, str(PIPELINE_SCRIPT), "--sample", sample, "--outputs", outputs]
    if mode:
        command.extend(["--mode", str(mode)])
    result = run_command(command, cwd=ROOT)
    append_log("Run Analysis", f"{sample} -> exit {result.returncode}")
    return {
        "ok": result.returncode == 0,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
        "state": build_state(),
    }


def run_datasets() -> dict[str, object]:
    result = run_command([sys.executable, str(DATASET_SCRIPT)], cwd=ROOT, timeout=1200)
    append_log("Rebuild Datasets", f"exit {result.returncode}")
    return {
        "ok": result.returncode == 0,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
        "state": build_state(),
    }


def run_agent(payload: dict[str, object]) -> dict[str, object]:
    provider = str(payload.get("provider", "gemini"))
    prompt = str(payload.get("prompt", "")).strip()
    if not prompt:
        return {"ok": False, "error": "prompt is required", "state": build_state()}

    workdir = str(payload.get("working_dir", ROOT))
    cwd = Path(workdir)
    tmp_output = None

    if provider == "gemini":
        command = ["gemini", "--prompt", prompt, "--output-format", "text", "--approval-mode", "plan", "--skip-trust"]
    elif provider == "claude":
        command = ["claude", "--print", "--output-format", "text", "--permission-mode", "plan", prompt]
    elif provider == "codex":
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".txt")
        tmp.close()
        tmp_output = Path(tmp.name)
        command = [
            "codex",
            "exec",
            "-C",
            str(cwd),
            "--skip-git-repo-check",
            "-o",
            str(tmp_output),
            prompt,
        ]
    else:
        return {"ok": False, "error": f"unsupported provider: {provider}", "state": build_state()}

    result = run_command(command, cwd=cwd, timeout=1200)
    output = result.stdout.strip()
    if tmp_output and tmp_output.exists():
        output = tmp_output.read_text(errors="ignore").strip() or output
        tmp_output.unlink(missing_ok=True)

    append_log("Run Local Agent", f"{provider} -> exit {result.returncode}")
    return {
        "ok": result.returncode == 0,
        "output": output[:12000],
        "stderr": result.stderr[-4000:],
        "state": build_state(),
    }


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DASHBOARD_DIR), **kwargs)

    def _write_json(self, payload: dict[str, object], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            self._write_json(build_state())
            return
        return super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        payload = json.loads(raw.decode("utf-8") or "{}")

        if parsed.path == "/api/run-analysis":
            self._write_json(run_analysis(payload))
            return
        if parsed.path == "/api/rebuild-datasets":
            self._write_json(run_datasets())
            return
        if parsed.path == "/api/run-agent":
            self._write_json(run_agent(payload))
            return

        self._write_json({"ok": False, "error": "not found"}, status=HTTPStatus.NOT_FOUND)


def main() -> None:
    host = os.getenv("DASHBOARD_HOST", "127.0.0.1")
    port = int(os.getenv("DASHBOARD_PORT", "4317"))
    server = ThreadingHTTPServer((host, port), DashboardHandler)
    print(f"Dashboard running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
