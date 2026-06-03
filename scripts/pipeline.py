from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import textwrap
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


SOURCE_FUNCS = {"gets", "fgets", "scanf", "read", "recv"}
SINK_FUNCS = {"system", "popen", "execl", "execve", "strcpy", "strcat"}
FORMAT_CALLS = {"snprintf", "sprintf", "vsnprintf"}
BUFFER_COPY_CALLS = {"strcpy", "strcat", "memcpy"}
SINK_KIND_MAP = {
    "strcpy": 1,
    "strcat": 1,
    "memcpy": 2,
    "system": 3,
    "popen": 3,
    "execl": 3,
    "execve": 3,
}
REQUIRED_REPORT_SECTIONS = [
    "Executive Summary",
    "Root Cause",
    "Evidence",
    "Retrieved Context",
    "Remediation",
    "Confidence",
]


@dataclass
class PathCandidate:
    origin: str
    source: str
    sink: str
    source_line: int | None
    sink_line: int | None
    path_length: int
    is_guarded: bool
    contains_buffer_copy: bool
    contains_formatting_call: bool
    file_path: str
    source_code: str
    sink_code: str
    evidence: list[str] = field(default_factory=list)

    def to_feature_row(self) -> dict[str, int]:
        return {
            "path_length": self.path_length,
            "has_source": int(bool(self.source)),
            "has_sink": int(bool(self.sink)),
            "is_guarded": int(self.is_guarded),
            "contains_buffer_copy": int(self.contains_buffer_copy),
            "contains_formatting_call": int(self.contains_formatting_call),
            "sink_kind": SINK_KIND_MAP.get(self.sink, 0),
        }


@dataclass
class RetrievedDocument:
    title: str
    path: str
    score: float
    excerpt: str


class SourceAnalyzer:
    def extract_paths(self, sample_path: Path) -> list[PathCandidate]:
        raise NotImplementedError


class JoernAdapter(SourceAnalyzer):
    def __init__(
        self,
        joern_binary: str = "joern",
        joern_parse_binary: str = "joern-parse",
        script_path: Path | None = None,
    ) -> None:
        self.joern_binary = joern_binary
        self.joern_parse_binary = joern_parse_binary
        self.script_path = script_path or Path(__file__).resolve().with_name("joern_extract.sc")

    def is_available(self) -> bool:
        return shutil.which(self.joern_binary) is not None and shutil.which(self.joern_parse_binary) is not None

    def extract_paths(self, sample_path: Path) -> list[PathCandidate]:
        if not self.is_available():
            raise RuntimeError("Joern is not available on PATH.")
        if not self.script_path.exists():
            raise RuntimeError(f"Joern script not found: {self.script_path}")

        command = [
            self.joern_binary,
            "--script",
            str(self.script_path),
            "--param",
            f"inputPath={sample_path}",
        ]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )

        output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
        candidates = self._parse_output(output, sample_path)
        self._cleanup_workspace(sample_path)

        if result.returncode != 0 and not candidates:
            raise RuntimeError(f"Joern query failed with exit code {result.returncode}: {output[-2000:]}")
        if not candidates:
            raise RuntimeError(f"Joern did not return any candidate paths. Recent output:\n{output[-2000:]}")
        return candidates

    def _parse_output(self, output: str, sample_path: Path) -> list[PathCandidate]:
        candidates: list[PathCandidate] = []
        for line in output.splitlines():
            if not line.startswith("JOERN_RESULT\t"):
                continue

            parts = line.split("\t")
            if len(parts) < 13:
                continue

            _, file_name, source, sink, source_line, sink_line, path_length, is_guarded, has_buffer_copy, has_formatting, method_name, source_code, sink_code = parts[:13]
            file_path = str(sample_path) if Path(file_name).name == sample_path.name else file_name
            evidence = []
            if method_name:
                evidence.append(f"Joern method: {method_name}")

            candidates.append(
                PathCandidate(
                    origin="joern-cpg",
                    source=source,
                    sink=sink,
                    source_line=int(source_line),
                    sink_line=int(sink_line),
                    path_length=int(path_length),
                    is_guarded=is_guarded.lower() == "true",
                    contains_buffer_copy=has_buffer_copy.lower() == "true",
                    contains_formatting_call=has_formatting.lower() == "true",
                    file_path=file_path,
                    source_code=source_code.strip(),
                    sink_code=sink_code.strip(),
                    evidence=evidence,
                )
            )

        return candidates

    @staticmethod
    def _cleanup_workspace(sample_path: Path) -> None:
        workspace_project = Path.home() / "workspace" / sample_path.name
        if workspace_project.exists():
            shutil.rmtree(workspace_project, ignore_errors=True)


class FallbackSourceAnalyzer(SourceAnalyzer):
    def extract_paths(self, sample_path: Path) -> list[PathCandidate]:
        lines = sample_path.read_text().splitlines()
        source_hits = []
        sink_hits = []
        has_guard = any(("if (" in line or "if(" in line) for line in lines)
        has_buffer_copy = any(call in line for line in lines for call in BUFFER_COPY_CALLS)
        has_formatting_call = any(call in line for line in lines for call in FORMAT_CALLS)

        for idx, line in enumerate(lines, start=1):
            src = self._match_call(line, SOURCE_FUNCS)
            if src:
                source_hits.append((idx, src, line.rstrip()))

            sink = self._match_call(line, SINK_FUNCS)
            if sink:
                sink_hits.append((idx, sink, line.rstrip()))

        candidates: list[PathCandidate] = []
        for source_line, source_name, source_code in source_hits:
            for sink_line, sink_name, sink_code in sink_hits:
                if sink_line <= source_line:
                    continue
                candidates.append(
                    PathCandidate(
                        origin="source-fallback",
                        source=source_name,
                        sink=sink_name,
                        source_line=source_line,
                        sink_line=sink_line,
                        path_length=max(1, sink_line - source_line),
                        is_guarded=has_guard,
                        contains_buffer_copy=has_buffer_copy,
                        contains_formatting_call=has_formatting_call,
                        file_path=str(sample_path),
                        source_code=source_code.strip(),
                        sink_code=sink_code.strip(),
                        evidence=[],
                    )
                )
        return candidates

    @staticmethod
    def _match_call(line: str, call_names: Iterable[str]) -> str | None:
        for name in call_names:
            if re.search(rf"\b{name}\s*\(", line):
                return name
        return None


class BinaryAnalyzer:
    def extract_paths(self, binary_path: Path) -> list[PathCandidate]:
        imports = self._collect_imports(binary_path)
        strings_blob = self._run_command(["strings", "-a", str(binary_path)])
        disassembly_hint = self._collect_r2_hint(binary_path)

        sink_hits = [name for name in SINK_FUNCS if re.search(rf"\b_?{re.escape(name)}\b", imports)]
        if not sink_hits:
            sink_hits = [name for name in SINK_FUNCS if name in strings_blob]

        source_guess = "stdin-or-argv"
        has_guard = any(token in strings_blob.lower() for token in ("empty input", "admin", "usage"))
        has_formatting_call = any(name in imports for name in FORMAT_CALLS) or any(name in strings_blob for name in FORMAT_CALLS)
        has_buffer_copy = any(name in imports for name in BUFFER_COPY_CALLS) or any(name in strings_blob for name in BUFFER_COPY_CALLS)

        evidence = []
        if imports.strip():
            evidence.append(f"Imported symbols: {imports[:500].strip()}")
        if disassembly_hint.strip():
            evidence.append(f"radare2 hint: {disassembly_hint[:500].strip()}")
        flagged_strings = self._pick_suspicious_strings(strings_blob)
        if flagged_strings:
            evidence.append("Suspicious strings: " + " | ".join(flagged_strings[:6]))

        if not sink_hits:
            return []

        return [
            PathCandidate(
                origin="binary-static",
                source=source_guess,
                sink=sink_name,
                source_line=None,
                sink_line=None,
                path_length=1,
                is_guarded=has_guard,
                contains_buffer_copy=has_buffer_copy,
                contains_formatting_call=has_formatting_call,
                file_path=str(binary_path),
                source_code="binary input boundary",
                sink_code=f"imported symbol: {sink_name}",
                evidence=evidence,
            )
            for sink_name in sink_hits
        ]

    def _collect_imports(self, binary_path: Path) -> str:
        imports = self._run_command(["nm", "-gj", str(binary_path)])
        if imports.strip():
            return imports
        return self._run_command(["otool", "-Iv", str(binary_path)])

    def _collect_r2_hint(self, binary_path: Path) -> str:
        if shutil.which("r2") is None:
            return ""
        return self._run_command(
            [
                "r2",
                "-A",
                "-q",
                "-c",
                "aaa; izz~flag; afl~system; afl~strcpy; afl~strcat",
                str(binary_path),
            ]
        )

    @staticmethod
    def _pick_suspicious_strings(strings_blob: str) -> list[str]:
        picked = []
        for line in strings_blob.splitlines():
            lower_line = line.lower()
            if any(token in lower_line for token in ("flag{", "name>", "hello", "admin", "system", "echo ")):
                picked.append(line.strip())
        return picked

    @staticmethod
    def _run_command(command: list[str]) -> str:
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
            )
            return (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
        except FileNotFoundError:
            return ""


class KnowledgeBaseRetriever:
    def __init__(self, knowledge_dir: Path) -> None:
        self.knowledge_dir = knowledge_dir
        self.documents = self._load_documents()
        self.vectorizer: TfidfVectorizer | None = None
        self.matrix = None

        if self.documents:
            self.vectorizer = TfidfVectorizer(stop_words="english")
            self.matrix = self.vectorizer.fit_transform([doc["text"] for doc in self.documents])

    def _load_documents(self) -> list[dict[str, str]]:
        docs = []
        if not self.knowledge_dir.exists():
            return docs
        for path in sorted(self.knowledge_dir.glob("*.md")):
            docs.append(
                {
                    "title": path.stem.replace("_", " ").title(),
                    "path": str(path),
                    "text": path.read_text(),
                }
            )
        return docs

    def search(self, query: str, top_k: int = 2) -> list[RetrievedDocument]:
        if not self.documents or self.vectorizer is None or self.matrix is None:
            return []
        query_vec = self.vectorizer.transform([query])
        similarities = cosine_similarity(query_vec, self.matrix).flatten()
        ranked_indices = similarities.argsort()[::-1][:top_k]
        results = []
        for idx in ranked_indices:
            score = float(similarities[idx])
            if score <= 0:
                continue
            doc = self.documents[idx]
            excerpt = self._build_excerpt(doc["text"], query)
            results.append(
                RetrievedDocument(
                    title=doc["title"],
                    path=doc["path"],
                    score=round(score, 6),
                    excerpt=excerpt,
                )
            )
        return results

    @staticmethod
    def _build_excerpt(text: str, query: str) -> str:
        query_tokens = [token for token in re.findall(r"[A-Za-z_]+", query.lower()) if len(token) > 3]
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        for line in lines:
            lower_line = line.lower()
            if any(token in lower_line for token in query_tokens):
                return line[:400]
        return " ".join(lines[:3])[:400]


class LLMAnalysisClient:
    def __init__(self, model: str) -> None:
        self.model = model
        self.api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate_report(self, prompt: str) -> str:
        if not self.is_configured():
            raise RuntimeError("LLM API key is not configured.")

        payload = {
            "model": self.model,
            "max_tokens": 1400,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        }
        request = urllib.request.Request(
            f"{self.base_url}/v1/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if "Cloudflare" in body or "Attention Required" in body:
                raise RuntimeError(
                    f"LLM request failed with HTTP {exc.code}: blocked by upstream Cloudflare protection"
                ) from exc
            raise RuntimeError(f"LLM request failed with HTTP {exc.code}: {body[:500]}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"LLM request failed: {exc.reason}") from exc

        parsed = json.loads(raw)
        content = parsed.get("content", [])
        text_chunks = [item.get("text", "") for item in content if item.get("type") == "text"]
        return "\n".join(chunk for chunk in text_chunks if chunk).strip()


def load_training_data(training_csv: Path) -> tuple[pd.DataFrame, pd.Series]:
    dataset = pd.read_csv(training_csv)
    x = dataset.drop(columns=["label"])
    y = dataset["label"]
    return x, y


def train_model(training_csv: Path) -> RandomForestClassifier:
    x, y = load_training_data(training_csv)
    model = RandomForestClassifier(
        n_estimators=120,
        max_depth=6,
        random_state=42,
    )
    model.fit(x, y)
    return model


def build_context_window(sample_path: Path, center_line: int | None, radius: int = 10) -> str:
    if center_line is None:
        return "No source line is available for this candidate."
    lines = sample_path.read_text().splitlines()
    start = max(1, center_line - radius)
    end = min(len(lines), center_line + radius)
    snippet = []
    for line_number in range(start, end + 1):
        snippet.append(f"{line_number:04d}: {lines[line_number - 1]}")
    return "\n".join(snippet)


def build_binary_context(candidate: PathCandidate) -> str:
    parts = [f"Binary file: {candidate.file_path}", f"Sink import: {candidate.sink}"]
    if candidate.evidence:
        parts.extend(candidate.evidence)
    return "\n".join(parts)


def build_retrieval_query(candidate: PathCandidate, context: str) -> str:
    return f"{candidate.sink} {candidate.source} guarded={candidate.is_guarded} {context[:500]}"


def format_retrieved_docs(docs: list[RetrievedDocument]) -> str:
    if not docs:
        return "No related knowledge base documents were retrieved."
    blocks = []
    for doc in docs:
        blocks.append(
            f"- {doc.title} ({doc.score:.3f}) from {doc.path}\n  {doc.excerpt}"
        )
    return "\n".join(blocks)


def generate_analysis_prompt(
    candidate: PathCandidate,
    score: float,
    context: str,
    retrieved_docs: list[RetrievedDocument],
    validation_feedback: str = "",
) -> str:
    feedback_block = ""
    if validation_feedback:
        feedback_block = (
            "\nThe previous draft failed validation.\n"
            f"Please fix these issues exactly: {validation_feedback}\n"
        )
    retrieved_text = format_retrieved_docs(retrieved_docs)
    return textwrap.dedent(
        f"""
        You are a software security analysis assistant.

        Produce a concise Markdown report with these exact section headings:
        Executive Summary
        Root Cause
        Evidence
        Retrieved Context
        Remediation
        Confidence

        Candidate metadata:
        - Origin: {candidate.origin}
        - File: {candidate.file_path}
        - Source: {candidate.source}
        - Sink: {candidate.sink}
        - Source line: {candidate.source_line}
        - Sink line: {candidate.sink_line}
        - ML probability: {score:.3f}
        - Guarded: {candidate.is_guarded}
        - Buffer copy present: {candidate.contains_buffer_copy}
        - Formatting call present: {candidate.contains_formatting_call}

        Local context:
        ```text
        {context}
        ```

        Related retrieved references:
        {retrieved_text}
        {feedback_block}
        Constraints:
        - Do not provide payloads, exploit steps, or weaponized commands.
        - Focus on vulnerability reasoning, impact, and remediation.
        - Mention uncertainty explicitly when evidence is partial.
        """
    ).strip()


def validate_report_sections(report: str) -> list[str]:
    missing = []
    for section in REQUIRED_REPORT_SECTIONS:
        if f"{section}" not in report:
            missing.append(section)
    return missing


def build_heuristic_report(candidate: PathCandidate, score: float, context: str, retrieved_docs: list[RetrievedDocument]) -> str:
    retrieved_text = format_retrieved_docs(retrieved_docs)
    evidence_lines = [
        f"- Candidate origin: {candidate.origin}",
        f"- Source: {candidate.source} at line {candidate.source_line}",
        f"- Sink: {candidate.sink} at line {candidate.sink_line}",
        f"- Model probability: {score:.3f}",
    ]
    for item in candidate.evidence:
        evidence_lines.append(f"- {item}")
    return textwrap.dedent(
        f"""
        ## Executive Summary
        The pipeline flagged a likely unsafe data flow from `{candidate.source}` to `{candidate.sink}` in `{candidate.file_path}`.

        ## Root Cause
        Untrusted input can reach a dangerous API without strong normalization or allow-listing. The surrounding code suggests the application composes a command string from user-controlled data.

        ## Evidence
        {'\n'.join(evidence_lines)}

        Context excerpt:
        ```text
        {context}
        ```

        ## Retrieved Context
        {retrieved_text}

        ## Remediation
        Replace shell invocation patterns with direct API calls where possible. If a command must be built, enforce an allow-list, reject shell metacharacters, and keep user-controlled data out of command interpreters.

        ## Confidence
        Medium. The sink is high risk and the evidence is consistent, but this result should still be manually reviewed.
        """
    ).strip()


def compile_sample(sample_path: Path, output_binary: Path) -> None:
    subprocess.run(
        ["clang", str(sample_path), "-o", str(output_binary)],
        check=True,
        capture_output=True,
        text=True,
    )


def render_report_with_retries(
    client: LLMAnalysisClient,
    candidate: PathCandidate,
    score: float,
    context: str,
    retrieved_docs: list[RetrievedDocument],
    max_attempts: int = 3,
) -> tuple[str, dict[str, object]]:
    if not client.is_configured():
        report = build_heuristic_report(candidate, score, context, retrieved_docs)
        return report, {
            "used_llm": False,
            "fallback_used": True,
            "attempts": 0,
            "validation_errors": [],
        }

    validation_errors: list[dict[str, object]] = []
    feedback = ""
    for attempt in range(1, max_attempts + 1):
        prompt = generate_analysis_prompt(candidate, score, context, retrieved_docs, feedback)
        try:
            report = client.generate_report(prompt)
        except RuntimeError as exc:
            heuristic = build_heuristic_report(candidate, score, context, retrieved_docs)
            validation_errors.append({"attempt": attempt, "runtime_error": str(exc)})
            return heuristic, {
                "used_llm": True,
                "fallback_used": True,
                "attempts": attempt,
                "validation_errors": validation_errors,
            }
        missing = validate_report_sections(report)
        validation_errors.append({"attempt": attempt, "missing_sections": missing})
        if not missing:
            return report, {
                "used_llm": True,
                "fallback_used": False,
                "attempts": attempt,
                "validation_errors": validation_errors,
            }
        feedback = "Missing sections: " + ", ".join(missing)

    heuristic = build_heuristic_report(candidate, score, context, retrieved_docs)
    return heuristic, {
        "used_llm": True,
        "fallback_used": True,
        "attempts": max_attempts,
        "validation_errors": validation_errors,
    }


def analyze_source(
    sample: Path,
    training_csv: Path,
    outputs_dir: Path,
    knowledge_dir: Path,
    llm_model: str,
) -> dict[str, object]:
    outputs_dir.mkdir(parents=True, exist_ok=True)

    joern = JoernAdapter()
    fallback = FallbackSourceAnalyzer()
    analyzer_name = "joern"
    analyzer_note = ""
    try:
        if joern.is_available():
            candidates = joern.extract_paths(sample)
        else:
            raise RuntimeError("Joern is not installed.")
    except RuntimeError as exc:
        analyzer_name = "fallback-static-analyzer"
        analyzer_note = str(exc)
        candidates = fallback.extract_paths(sample)

    if not candidates:
        raise RuntimeError("No candidate paths were extracted from the source sample.")

    model = train_model(training_csv)
    feature_frame = pd.DataFrame([candidate.to_feature_row() for candidate in candidates])
    scores = model.predict_proba(feature_frame)[:, 1]

    ranked: list[dict[str, object]] = []
    for candidate, score in zip(candidates, scores):
        record = asdict(candidate)
        record["score"] = round(float(score), 6)
        record["features"] = candidate.to_feature_row()
        ranked.append(record)
    ranked.sort(key=lambda item: item["score"], reverse=True)
    best = ranked[0]

    best_candidate = next(
        candidate
        for candidate in candidates
        if candidate.file_path == best["file_path"]
        and candidate.source == best["source"]
        and candidate.sink == best["sink"]
        and candidate.source_line == best["source_line"]
        and candidate.sink_line == best["sink_line"]
    )

    context = build_context_window(sample, best_candidate.sink_line)
    retriever = KnowledgeBaseRetriever(knowledge_dir)
    retrieved_docs = retriever.search(build_retrieval_query(best_candidate, context), top_k=2)
    report, validation = render_report_with_retries(
        LLMAnalysisClient(llm_model),
        best_candidate,
        best["score"],
        context,
        retrieved_docs,
    )

    compiled_binary = outputs_dir / f"{sample.stem}.bin"
    compile_sample(sample, compiled_binary)
    binary_candidates = BinaryAnalyzer().extract_paths(compiled_binary)

    (outputs_dir / "ranked_paths.json").write_text(json.dumps(ranked, indent=2))
    (outputs_dir / "features_scored.csv").write_text(feature_frame.assign(score=scores).to_csv(index=False))
    (outputs_dir / "context_window.txt").write_text(context)
    (outputs_dir / "retrieved_context.json").write_text(
        json.dumps([asdict(doc) for doc in retrieved_docs], indent=2)
    )
    (outputs_dir / "analysis_report.md").write_text(report)
    (outputs_dir / "validation.json").write_text(json.dumps(validation, indent=2))
    (outputs_dir / "binary_corroboration.json").write_text(
        json.dumps([asdict(candidate) for candidate in binary_candidates], indent=2)
    )
    if analyzer_note:
        (outputs_dir / "analyzer_note.txt").write_text(analyzer_note)

    return {
        "pipeline_mode": "source",
        "analyzer": analyzer_name,
        "candidate_count": len(candidates),
        "best_candidate": best,
        "compiled_binary": str(compiled_binary),
        "binary_corroboration_count": len(binary_candidates),
        "report_path": str(outputs_dir / "analysis_report.md"),
        "validation": validation,
    }


def analyze_binary(
    sample: Path,
    training_csv: Path,
    outputs_dir: Path,
    knowledge_dir: Path,
    llm_model: str,
) -> dict[str, object]:
    outputs_dir.mkdir(parents=True, exist_ok=True)
    candidates = BinaryAnalyzer().extract_paths(sample)
    if not candidates:
        raise RuntimeError("No candidate paths were extracted from the binary sample.")

    model = train_model(training_csv)
    feature_frame = pd.DataFrame([candidate.to_feature_row() for candidate in candidates])
    scores = model.predict_proba(feature_frame)[:, 1]

    ranked: list[dict[str, object]] = []
    for candidate, score in zip(candidates, scores):
        record = asdict(candidate)
        record["score"] = round(float(score), 6)
        record["features"] = candidate.to_feature_row()
        ranked.append(record)
    ranked.sort(key=lambda item: item["score"], reverse=True)
    best = ranked[0]

    best_candidate = next(
        candidate
        for candidate in candidates
        if candidate.file_path == best["file_path"] and candidate.sink == best["sink"]
    )
    context = build_binary_context(best_candidate)
    retriever = KnowledgeBaseRetriever(knowledge_dir)
    retrieved_docs = retriever.search(build_retrieval_query(best_candidate, context), top_k=2)
    report, validation = render_report_with_retries(
        LLMAnalysisClient(llm_model),
        best_candidate,
        best["score"],
        context,
        retrieved_docs,
    )

    (outputs_dir / "ranked_paths.json").write_text(json.dumps(ranked, indent=2))
    (outputs_dir / "features_scored.csv").write_text(feature_frame.assign(score=scores).to_csv(index=False))
    (outputs_dir / "context_window.txt").write_text(context)
    (outputs_dir / "retrieved_context.json").write_text(
        json.dumps([asdict(doc) for doc in retrieved_docs], indent=2)
    )
    (outputs_dir / "analysis_report.md").write_text(report)
    (outputs_dir / "validation.json").write_text(json.dumps(validation, indent=2))

    return {
        "pipeline_mode": "binary",
        "analyzer": "binary-static-analyzer",
        "candidate_count": len(candidates),
        "best_candidate": best,
        "report_path": str(outputs_dir / "analysis_report.md"),
        "validation": validation,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Hybrid vulnerability analysis demo.")
    parser.add_argument(
        "--sample",
        default="samples/command_injection_challenge.c",
        help="Path to the source or binary sample to analyze.",
    )
    parser.add_argument(
        "--training-data",
        default="data/training_paths.csv",
        help="CSV file used to train the simple classifier.",
    )
    parser.add_argument(
        "--knowledge-dir",
        default="data/knowledge_base",
        help="Directory containing knowledge-base markdown files.",
    )
    parser.add_argument(
        "--outputs",
        default="outputs",
        help="Directory where generated artifacts will be stored.",
    )
    parser.add_argument(
        "--mode",
        choices=("auto", "source", "binary"),
        default="auto",
        help="Force source or binary analysis mode.",
    )
    parser.add_argument(
        "--llm-model",
        default=os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"),
        help="Model name for the optional report-generation client.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    project_root = Path(__file__).resolve().parent.parent
    sample = (project_root / args.sample).resolve()
    training_csv = (project_root / args.training_data).resolve()
    knowledge_dir = (project_root / args.knowledge_dir).resolve()
    outputs_dir = (project_root / args.outputs).resolve()

    if args.mode == "source" or (args.mode == "auto" and sample.suffix.lower() in {".c", ".h"}):
        result = analyze_source(sample, training_csv, outputs_dir, knowledge_dir, args.llm_model)
    elif args.mode == "binary" or args.mode == "auto":
        result = analyze_binary(sample, training_csv, outputs_dir, knowledge_dir, args.llm_model)
    else:
        raise RuntimeError(f"Unsupported sample type: {sample}")

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
