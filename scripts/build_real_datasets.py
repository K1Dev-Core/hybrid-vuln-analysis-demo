from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXTERNAL = ROOT / "external_data"
PROCESSED = ROOT / "data" / "processed"
KNOWLEDGE = ROOT / "data" / "knowledge_base"

SOURCE_FUNCS = {"gets", "fgets", "scanf", "read", "recv"}
SINK_FUNCS = {"system", "popen", "execl", "execve", "strcpy", "strcat", "memcpy"}
FORMAT_CALLS = {"snprintf", "sprintf", "vsnprintf", "printf", "fprintf"}
BUFFER_COPY_CALLS = {"strcpy", "strcat", "memcpy"}
TOPIC_KEYWORDS = {
    "buffer_overflow": ["strcpy", "strcat", "buffer overflow", "stack overflow", "heap overflow"],
    "format_string": ["format string", "printf(", "%n", "%x", "%s"],
    "command_injection": ["system(", "popen(", "exec", "command injection", "shell"],
    "rop": ["rop", "return oriented programming", "stack pivot", "ret2libc"],
    "heap": ["heap", "unlink", "fastbin", "tcache"],
    "integer_overflow": ["integer overflow", "signedness", "wraparound", "cwe-190", "cwe-189"],
}
CWE_FAMILY_MAP = {
    "CWE-119": "buffer_overflow",
    "CWE-120": "buffer_overflow",
    "CWE-121": "buffer_overflow",
    "CWE-122": "buffer_overflow",
    "CWE-124": "buffer_overflow",
    "CWE-126": "buffer_overflow",
    "CWE-134": "format_string",
    "CWE-78": "command_injection",
    "CWE-77": "command_injection",
    "CWE-190": "integer_overflow",
    "CWE-189": "integer_overflow",
}


def ensure_dirs() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    KNOWLEDGE.mkdir(parents=True, exist_ok=True)


def infer_topic(text: str) -> str:
    lower = text.lower()
    for topic, keywords in TOPIC_KEYWORDS.items():
        if any(keyword in lower for keyword in keywords):
            return topic
    return "other"


def first_match(line: str, names: set[str]) -> str:
    for name in names:
        if re.search(rf"\b{name}\s*\(", line):
            return name
    return ""


def build_feature_row(code: str, label: int, source_dataset: str, identifier: str, project: str) -> dict[str, object]:
    lines = code.splitlines()
    source_line = None
    sink_line = None
    source_name = ""
    sink_name = ""
    has_guard = any(("if (" in line or "if(" in line) for line in lines)
    contains_formatting = any(call in code for call in FORMAT_CALLS)
    contains_buffer_copy = any(call in code for call in BUFFER_COPY_CALLS)

    for idx, line in enumerate(lines, start=1):
        if not source_name:
            source_name = first_match(line, SOURCE_FUNCS)
            if source_name:
                source_line = idx
        if not sink_name:
            sink_name = first_match(line, SINK_FUNCS)
            if sink_name:
                sink_line = idx

    if source_line is not None and sink_line is not None and sink_line > source_line:
        path_length = sink_line - source_line
    else:
        path_length = max(1, min(len(lines), 80))

    sink_kind = 0
    if sink_name in {"strcpy", "strcat"}:
        sink_kind = 1
    elif sink_name == "memcpy":
        sink_kind = 2
    elif sink_name in {"system", "popen", "execl", "execve"}:
        sink_kind = 3

    return {
        "path_length": path_length,
        "has_source": int(bool(source_name)),
        "has_sink": int(bool(sink_name)),
        "is_guarded": int(has_guard),
        "contains_buffer_copy": int(contains_buffer_copy),
        "contains_formatting_call": int(contains_formatting),
        "sink_kind": sink_kind,
        "label": int(label),
        "source_dataset": source_dataset,
        "identifier": identifier,
        "project": project,
        "matched_source": source_name,
        "matched_sink": sink_name,
        "line_count": len(lines),
    }


def load_devign() -> tuple[list[dict[str, object]], list[dict[str, object]], Counter]:
    dataset_path = EXTERNAL / "devign" / "data" / "raw" / "dataset.json"
    items = json.loads(dataset_path.read_text())
    rows = []
    features = []
    topic_counts: Counter = Counter()

    for idx, item in enumerate(items):
        code = item.get("func", "")
        topic = infer_topic(code)
        topic_counts[topic] += 1
        identifier = f"devign-{idx}"
        rows.append(
            {
                "dataset": "devign",
                "identifier": identifier,
                "project": item.get("project", ""),
                "commit_id": item.get("commit_id", ""),
                "label": int(item.get("target", 0)),
                "lang": "C/C++",
                "topic": topic,
                "func": code,
            }
        )
        features.append(
            build_feature_row(
                code=code,
                label=int(item.get("target", 0)),
                source_dataset="devign",
                identifier=identifier,
                project=item.get("project", ""),
            )
        )
    return rows, features, topic_counts


def load_msr() -> tuple[list[dict[str, object]], Counter]:
    csv.field_size_limit(sys.maxsize)
    dataset_path = EXTERNAL / "MSR_20_Code_vulnerability_CSV_Dataset" / "all_c_cpp_release2.0.csv"
    rows = []
    cwe_counts: Counter = Counter()

    with dataset_path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        reader = csv.DictReader(handle)
        for idx, row in enumerate(reader):
            topic = CWE_FAMILY_MAP.get(row.get("cwe_id", "").strip(), infer_topic(row.get("summary", "")))
            cwe = row.get("cwe_id", "").strip()
            if cwe:
                cwe_counts[cwe] += 1
            rows.append(
                {
                    "dataset": "msr20",
                    "identifier": f"msr20-{idx}",
                    "cve_id": row.get("cve_id", ""),
                    "cwe_id": cwe,
                    "summary": row.get("summary", ""),
                    "publish_date": row.get("publish_date", ""),
                    "score": row.get("score", ""),
                    "vulnerability_classification": row.get("vulnerability_classification", ""),
                    "commit_id": row.get("commit_id", ""),
                    "commit_message": row.get("commit_message", ""),
                    "files_changed": row.get("files_changed", ""),
                    "lang": row.get("lang", ""),
                    "project": row.get("project", ""),
                    "version_after_fix": row.get("version_after_fix", ""),
                    "version_before_fix": row.get("version_before_fix", ""),
                    "topic": topic,
                }
            )
    return rows, cwe_counts


def load_writeups() -> tuple[list[dict[str, object]], Counter]:
    roots = [
        EXTERNAL / "pwntools-write-ups",
        EXTERNAL / "writeups",
    ]
    rows = []
    topic_counts: Counter = Counter()

    for root in roots:
        if not root.exists():
            continue
        repo_name = root.name
        files = list(root.rglob("README.md")) + list(root.rglob("writeup.txt"))
        for idx, path in enumerate(files):
            try:
                text = path.read_text(errors="ignore")
            except OSError:
                continue
            topic = infer_topic(text)
            topic_counts[topic] += 1
            excerpt = re.sub(r"\s+", " ", text).strip()[:1200]
            rows.append(
                {
                    "dataset": "ctf_writeup",
                    "identifier": f"{repo_name}-{idx}",
                    "repo": repo_name,
                    "relative_path": str(path.relative_to(root)),
                    "title": path.parent.name,
                    "topic": topic,
                    "excerpt": excerpt,
                }
            )
    return rows, topic_counts


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def merge_training(base_path: Path, devign_features: list[dict[str, object]]) -> list[dict[str, object]]:
    with base_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        base_rows = list(reader)

    merged = []
    for row in base_rows:
        merged.append(
            {
                "path_length": row["path_length"],
                "has_source": row["has_source"],
                "has_sink": row["has_sink"],
                "is_guarded": row["is_guarded"],
                "contains_buffer_copy": row["contains_buffer_copy"],
                "contains_formatting_call": row["contains_formatting_call"],
                "sink_kind": row["sink_kind"],
                "label": row["label"],
            }
        )

    for row in devign_features:
        merged.append(
            {
                "path_length": row["path_length"],
                "has_source": row["has_source"],
                "has_sink": row["has_sink"],
                "is_guarded": row["is_guarded"],
                "contains_buffer_copy": row["contains_buffer_copy"],
                "contains_formatting_call": row["contains_formatting_call"],
                "sink_kind": row["sink_kind"],
                "label": row["label"],
            }
        )
    return merged


def write_dataset_knowledge(
    devign_topics: Counter,
    cwe_counts: Counter,
    writeup_topics: Counter,
) -> None:
    cwe_lines = []
    for cwe, count in cwe_counts.most_common(10):
        family = CWE_FAMILY_MAP.get(cwe, "other")
        cwe_lines.append(f"- {cwe}: {count} รายการ, กลุ่มหลัก `{family}`")

    (KNOWLEDGE / "real_world_cwe_notes.md").write_text(
        "\n".join(
            [
                "# Real World CWE Notes",
                "",
                "ไฟล์นี้สรุปจาก dataset จริงฝั่ง MSR 20 เพื่อให้ระบบพอรู้ว่าช่องโหว่แบบไหนโผล่บ่อยในโลกจริง",
                "",
                "## CWE ที่เจอบ่อย",
                "",
                *cwe_lines,
                "",
                "## หมายเหตุ",
                "",
                "- ถ้าเจอ `CWE-119/120/121/122` บ่อย แปลว่า bug ตระกูล memory safety ยังสำคัญมาก",
                "- ถ้าเจอ `CWE-78` หรือ `CWE-77` ก็เหมาะกับการโยงเข้ากลุ่ม command injection",
                "- ถ้าเจอ `CWE-134` ให้ระวัง format string เป็นพิเศษ",
            ]
        ),
        encoding="utf-8",
    )

    writeup_lines = [f"- {topic}: {count} ไฟล์" for topic, count in writeup_topics.most_common()]
    devign_lines = [f"- {topic}: {count} ฟังก์ชัน" for topic, count in devign_topics.most_common()]

    (KNOWLEDGE / "ctf_pwn_patterns.md").write_text(
        "\n".join(
            [
                "# CTF Pwn Patterns",
                "",
                "ไฟล์นี้สรุป pattern จาก write-up และตัวอย่างโค้ดจริงที่โหลดเข้ามาในโปรเจกต์",
                "",
                "## หัวข้อที่เจอใน write-up",
                "",
                *writeup_lines,
                "",
                "## หัวข้อที่เดาได้จาก Devign code samples",
                "",
                *devign_lines,
                "",
                "## เอาไปใช้ยังไง",
                "",
                "- ถ้า path ไปชน `strcpy` หรือ `strcat` ให้โยงกับ buffer overflow ก่อน",
                "- ถ้า path ไปชน `printf` แบบไม่มี format คงที่ ให้โยง format string",
                "- ถ้า path ไปชน `system` หรือ `exec*` ให้โยง command injection หรือ command execution",
                "- ถ้า write-up พูดถึง `ROP`, `GOT overwrite`, `stack pivot` บ่อย แปลว่าฝั่ง retrieval สามารถเอาไปช่วยอธิบายโจทย์ pwn ต่อได้",
            ]
        ),
        encoding="utf-8",
    )


def main() -> None:
    ensure_dirs()

    devign_rows, devign_features, devign_topics = load_devign()
    msr_rows, cwe_counts = load_msr()
    writeup_rows, writeup_topics = load_writeups()

    write_csv(PROCESSED / "devign_function_index.csv", devign_rows)
    write_csv(PROCESSED / "devign_feature_rows.csv", devign_features)
    write_csv(PROCESSED / "msr_c_cpp_vulns.csv", msr_rows)
    write_csv(PROCESSED / "ctf_writeups_index.csv", writeup_rows)

    merged_training = merge_training(ROOT / "data" / "training_paths.csv", devign_features)
    write_csv(PROCESSED / "training_paths_augmented.csv", merged_training)

    summary = {
        "devign_total": len(devign_rows),
        "devign_topics": dict(devign_topics),
        "msr_total": len(msr_rows),
        "top_cwe": cwe_counts.most_common(15),
        "writeup_total": len(writeup_rows),
        "writeup_topics": dict(writeup_topics),
        "augmented_training_rows": len(merged_training),
    }
    (PROCESSED / "dataset_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    write_dataset_knowledge(devign_topics, cwe_counts, writeup_topics)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
