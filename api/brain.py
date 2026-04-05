from __future__ import annotations

import json
from datetime import datetime
from textwrap import dedent
from typing import Any

from .config import settings

try:
    import google.genai as genai
except Exception:  # pragma: no cover
    genai = None


def _safe_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, indent=2, default=str)


def _strip_code_fence(text: str) -> str:
    cleaned = text.strip()
    if "```" not in cleaned:
        return cleaned

    parts = cleaned.split("```")
    for part in parts:
        candidate = part.strip()
        if candidate.startswith("json"):
            candidate = candidate[4:].strip()
        if candidate.startswith("{") or candidate.startswith("["):
            return candidate
    return cleaned


class VertexBrain:
    def __init__(self) -> None:
        self._client = None
        self._init_error = None
        if genai is None:
            self._init_error = "google-genai is not installed."
            return
        try:
            self._client = genai.Client(
                vertexai=True,
                project=settings.google_cloud_project,
                location=settings.gcp_location,
            )
            print(
                f"[DevLogBrain] Vertex AI enabled. Fast={settings.gemini_fast_model} Pro={settings.gemini_pro_model}"
            )
        except Exception as exc:  # pragma: no cover - depends on local auth
            self._init_error = str(exc)

    @property
    def available(self) -> bool:
        return self._client is not None

    @property
    def init_error(self) -> str | None:
        return self._init_error

    def summarize_change(
        self,
        *,
        file_path: str,
        diff: str,
        content: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        fallback = _fallback_change_summary(file_path, diff)
        if self._client is None:
            return fallback

        prompt = dedent(
            f"""
            You are DevLog AI. Analyze a code change and return JSON only.

            Project context:
            {_safe_json(context)}

            File path:
            {file_path}

            Diff:
            {diff[:3000]}

            File content excerpt:
            {(content or "")[:1800]}

            Return this JSON shape exactly:
            {{
              "summary": "1-2 concise sentences with file-specific detail",
              "classification": "feature|fix|refactor|config|breaking|unknown",
              "danger": true,
              "reason": "brief risk or impact note",
              "todos": ["todo item"],
              "affected_files": ["relative/path.py"]
            }}
            """
        ).strip()
        try:
            raw = self._generate(settings.gemini_fast_model, prompt)
            parsed = json.loads(_strip_code_fence(raw))
            return {
                "summary": parsed.get("summary") or fallback["summary"],
                "classification": parsed.get("classification") or fallback["classification"],
                "danger": bool(parsed.get("danger", fallback["danger"])),
                "reason": parsed.get("reason") or fallback["reason"],
                "todos": parsed.get("todos") or [],
                "affected_files": parsed.get("affected_files") or [file_path],
            }
        except Exception:
            return fallback

    def answer_query(self, *, question: str, context: dict[str, Any]) -> str:
        fallback = _fallback_query_answer(question, context)
        if self._client is None:
            return fallback

        code_matches = context.get("code_matches") or []
        prioritized_context = {
            "workspace_snapshot": context.get("workspace_snapshot", {}),
            "code_matches": code_matches,
            "recent_changes": context.get("recent_changes", []),
            "active_todos": context.get("active_todos", []),
            "risks": context.get("risks", []),
            "devlog_excerpt": context.get("devlog_excerpt", ""),
        }

        prompt = dedent(
            f"""
            You are DevLog AI. Answer the question directly using the current workspace context.
            Prioritize evidence in this order:
            1. code_matches
            2. workspace_snapshot.fileTree and diagnostics
            3. recent_changes
            4. devlog_excerpt only if it does not conflict with newer evidence

            If older devlog text conflicts with code_matches or workspace_snapshot, trust the code/workspace context.
            Keep the answer concise, concrete, and mention files when helpful.

            Question:
            {question}

            Context:
            {_safe_json(prioritized_context)}
            """
        ).strip()
        try:
            return self._generate(settings.gemini_fast_model, prompt).strip()
        except Exception:
            return fallback

    def generate_handoff(self, *, context: dict[str, Any]) -> str:
        fallback = _fallback_handoff(context)
        if self._client is None:
            return fallback

        prompt = dedent(
            f"""
            You are DevLog AI. Generate a concise markdown handoff.
            Include what was built, current state, recent changes, open todos, and risks.

            Context:
            {_safe_json(context)}
            """
        ).strip()
        try:
            text = self._generate(settings.gemini_fast_model, prompt).strip()
            if text.startswith("# "):
                return text
            header = f"# DevLog Handoff\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            return header + text
        except Exception:
            return fallback

    def enhance_explanation(self, payload: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        return self._enhance_json_payload(
            model=settings.gemini_pro_model,
            payload=payload,
            context=context,
            instruction=(
                "Improve the explanation summary and bullets without changing the factual grounding. "
                "Preserve keys, references, and Mermaid exactly if present."
            ),
        )

    def enhance_diagram(self, payload: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        return self._enhance_json_payload(
            model=settings.gemini_pro_model,
            payload=payload,
            context=context,
            instruction=(
                "Improve the diagram explanation while keeping Mermaid valid and grounded. "
                "Do not invent unsupported nodes or files."
            ),
        )

    def enhance_architecture(self, payload: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        return self._enhance_json_payload(
            model=settings.gemini_pro_model,
            payload=payload,
            context=context,
            instruction=(
                "Improve the architecture summary, entrypoint descriptions, and hotspot language while keeping Mermaid valid."
            ),
        )

    def _enhance_json_payload(
        self,
        *,
        model: str,
        payload: dict[str, Any],
        context: dict[str, Any],
        instruction: str,
    ) -> dict[str, Any]:
        if self._client is None:
            return payload
        prompt = dedent(
            f"""
            You are DevLog AI. Return JSON only.
            {instruction}

            Context:
            {_safe_json(context)}

            Input JSON:
            {_safe_json(payload)}
            """
        ).strip()
        try:
            raw = self._generate(model, prompt)
            parsed = json.loads(_strip_code_fence(raw))
            if isinstance(parsed, dict) and _payload_compatible(payload, parsed):
                return parsed
        except Exception:
            pass
        return payload

    def _generate(self, model: str, prompt: str) -> str:
        if self._client is None:
            raise RuntimeError("Vertex AI is not available.")
        response = self._client.models.generate_content(model=model, contents=prompt)
        return response.text or ""


def _fallback_change_summary(file_path: str, diff: str) -> dict[str, Any]:
    lines = diff.splitlines()
    added = [line for line in lines if line.startswith("+") and not line.startswith("+++")]
    removed = [line for line in lines if line.startswith("-") and not line.startswith("---")]

    classification = "feature"
    if file_path.endswith((".json", ".yml", ".yaml", ".toml", ".env")):
        classification = "config"
    elif removed and not added:
        classification = "breaking"
    elif added and removed:
        classification = "refactor"

    summary = f"Updated {file_path} with {len(added)} additions and {len(removed)} removals."
    reason = "Review follow-on effects if this change touched shared interfaces."
    danger = classification == "breaking"
    if any("TODO" in line.upper() or "FIXME" in line.upper() for line in lines):
        danger = True
        reason = "The diff still contains TODO/FIXME markers."

    return {
        "summary": summary,
        "classification": classification,
        "danger": danger,
        "reason": reason,
        "todos": [],
        "affected_files": [file_path],
    }


def _fallback_query_answer(question: str, context: dict[str, Any]) -> str:
    code_matches = context.get("code_matches") or []
    if code_matches:
        snippets = []
        for item in code_matches[:4]:
            file_path = item.get("filePath", "unknown")
            snippet = item.get("snippet") or ""
            snippets.append(f"{file_path}: {snippet}".strip())
        return "Relevant code matches:\n- " + "\n- ".join(snippets)

    timeline = context.get("recent_changes") or []
    if not timeline:
        return "No persisted project context is available yet. Save a file or wait for the workspace snapshot."
    latest = timeline[:3]
    snippets = [f"{item.get('filePath', 'unknown')}: {item.get('summary', 'No summary')}" for item in latest]
    return f"Recent persisted context for '{question}':\n- " + "\n- ".join(snippets)


def _fallback_handoff(context: dict[str, Any]) -> str:
    recent = context.get("recent_changes") or []
    todos = context.get("active_todos") or []
    risks = context.get("risks") or []
    recent_lines = "\n".join(
        f"- {item.get('filePath', 'unknown')}: {item.get('summary', 'No summary')}"
        for item in recent[:5]
    ) or "- No recent changes recorded."
    todo_lines = "\n".join(f"- {item}" for item in todos[:5]) or "- No open todos recorded."
    risk_lines = "\n".join(f"- {item}" for item in risks[:5]) or "- No active risks recorded."
    return (
        "# DevLog Handoff\n"
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        "## Recent Changes\n"
        f"{recent_lines}\n\n"
        "## Open Todos\n"
        f"{todo_lines}\n\n"
        "## Risks\n"
        f"{risk_lines}\n"
    )


def _payload_compatible(original: dict[str, Any], candidate: dict[str, Any]) -> bool:
    if set(candidate.keys()) != set(original.keys()):
        return False

    for key, original_value in original.items():
        candidate_value = candidate.get(key)
        if original_value is None:
            continue
        if isinstance(original_value, str) and not isinstance(candidate_value, str):
            return False
        if isinstance(original_value, dict) and not isinstance(candidate_value, dict):
            return False
        if isinstance(original_value, list):
            if not isinstance(candidate_value, list):
                return False
            if original_value and candidate_value:
                first_original = original_value[0]
                first_candidate = candidate_value[0]
                if isinstance(first_original, str) != isinstance(first_candidate, str):
                    return False
                if isinstance(first_original, dict) != isinstance(first_candidate, dict):
                    return False
    return True
