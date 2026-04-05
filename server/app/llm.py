from __future__ import annotations

import json
import re
from textwrap import dedent
from typing import Any

from pydantic import BaseModel

from .config import settings
from .models import ChangeEvent, LogUpdate, ProjectState

try:
    import vertexai  # type: ignore
    from vertexai.generative_models import GenerationConfig, GenerativeModel  # type: ignore
except Exception:  # pragma: no cover
    vertexai = None
    GenerationConfig = None
    GenerativeModel = None


class DevLogBrain:
    def __init__(self) -> None:
        self._model = None
        if settings.use_vertex and vertexai is not None and GenerativeModel is not None:
            vertexai.init(
                project=settings.google_cloud_project,
                location=settings.gcp_location,
            )
            self._model = GenerativeModel(settings.gemini_model)
            print(f"[DevLogBrain] Vertex AI enabled. Model: {settings.gemini_model}")

    def summarize_change(self, state: ProjectState, event: ChangeEvent) -> LogUpdate:
        if self._model is not None:
            prompt = dedent(
                f"""
                You are DevLog AI. Return JSON only.

                Current project markdown:
                {state.markdown or "No markdown yet."}

                Recent timeline:
                {json.dumps([item.model_dump(mode="json") for item in state.timeline[:8]], indent=2)}

                Incoming change event:
                {json.dumps(event.model_dump(mode="json"), indent=2)}

                Produce this JSON schema:
                {{
                  "classification": "feature|fix|refactor|config|breaking|revert|unknown",
                  "area": "frontend|backend|shared|infra|human_loop",
                  "summary": "one sentence",
                  "whyItMatters": "one sentence",
                  "todoAdds": ["..."],
                  "todoResolves": ["..."],
                  "riskFlag": "optional string",
                  "createSnapshot": true
                }}
                """
            ).strip()

            try:
                response = self._model.generate_content(
                    prompt,
                    generation_config=GenerationConfig(
                        temperature=0.2,
                        response_mime_type="application/json",
                    ),
                )
                return LogUpdate.model_validate_json(response.text)
            except Exception:
                pass

        return self._fallback_update(event)

    def answer_query(self, state: ProjectState, question: str) -> str:
        if self._model is not None:
            prompt = dedent(
                f"""
                You are DevLog AI. Answer the user's question using the project markdown and timeline.
                Keep it concise, concrete, and mention files when helpful.

                Project markdown:
                {state.markdown}

                Timeline:
                {json.dumps([item.model_dump(mode="json") for item in state.timeline[:12]], indent=2)}

                Question:
                {question}
                """
            ).strip()
            try:
                response = self._model.generate_content(prompt)
                return response.text.strip()
            except Exception:
                pass

        return self._fallback_query(state, question)

    def generate_handoff(self, state: ProjectState) -> str:
        if self._model is not None:
            prompt = dedent(
                f"""
                You are DevLog AI. Generate a session handoff in markdown.
                Include current state, last completed work, open risks, active todos, and next recommended steps.
                Keep it concise and directly useful for a new coding session.

                Project markdown:
                {state.markdown}

                Timeline:
                {json.dumps([item.model_dump(mode="json") for item in state.timeline[:12]], indent=2)}
                """
            ).strip()
            try:
                response = self._model.generate_content(prompt)
                return response.text.strip()
            except Exception:
                pass

        return self._fallback_handoff(state)

    def enhance_explanation(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._model is not None:
            prompt = dedent(
                f"""
                You are DevLog AI. Improve this IDE code explanation without changing its factual grounding.
                Keep the structure JSON-only and preserve references.

                Input JSON:
                {json.dumps(_json_ready(payload), indent=2)}

                Return the same JSON shape with sharper summary and bullets.
                """
            ).strip()
            try:
                response = self._model.generate_content(
                    prompt,
                    generation_config=GenerationConfig(
                        temperature=0.2,
                        response_mime_type="application/json",
                    ),
                )
                return json.loads(response.text)
            except Exception:
                pass
        return payload

    def enhance_diagram(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._model is not None:
            prompt = dedent(
                f"""
                You are DevLog AI. Improve this diagram explanation while keeping the Mermaid valid.
                Do not invent new nodes that are not implied by the payload.
                Return JSON only with the same shape.

                Input JSON:
                {json.dumps(_json_ready(payload), indent=2)}
                """
            ).strip()
            try:
                response = self._model.generate_content(
                    prompt,
                    generation_config=GenerationConfig(
                        temperature=0.2,
                        response_mime_type="application/json",
                    ),
                )
                return json.loads(response.text)
            except Exception:
                pass
        return payload

    def enhance_architecture(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._model is not None:
            prompt = dedent(
                f"""
                You are DevLog AI. Improve this architecture summary and hotspot language.
                Keep the Mermaid valid and grounded in the existing payload.
                Return JSON only with the same shape.

                Input JSON:
                {json.dumps(_json_ready(payload), indent=2)}
                """
            ).strip()
            try:
                response = self._model.generate_content(
                    prompt,
                    generation_config=GenerationConfig(
                        temperature=0.2,
                        response_mime_type="application/json",
                    ),
                )
                return json.loads(response.text)
            except Exception:
                pass
        return payload

    def _fallback_update(self, event: ChangeEvent) -> LogUpdate:
        diff = event.diffText.lower()
        file_path = event.filePath.replace("\\", "/")
        add_count = sum(1 for line in event.diffText.splitlines() if line.startswith("+") and not line.startswith("+++"))
        delete_count = sum(1 for line in event.diffText.splitlines() if line.startswith("-") and not line.startswith("---"))

        if file_path.startswith("web/") or "/src/" in file_path:
            area = "frontend"
        elif file_path.startswith("server/"):
            area = "backend"
        elif file_path.startswith("agent/") or any(token in file_path for token in ("docker", ".env", "yaml", "yml", "toml", "json")):
            area = "infra"
        else:
            area = "shared"

        if any(token in file_path for token in ("package.json", "vite.config", "tsconfig", ".env", "dockerfile", "requirements.txt")):
            classification = "config"
        elif event.changeType == "delete":
            classification = "breaking"
        elif any(token in diff for token in ("fix", "bug", "error", "retry", "timeout", "cors", "fallback", "graceful")):
            classification = "fix"
        elif add_count > 25 and delete_count > 10:
            classification = "refactor"
        elif add_count > 0:
            classification = "feature"
        else:
            classification = "unknown"

        risk = None
        if any(token in diff for token in ("todo", "fixme", "xxx", "hack", "raise ", "throw ", "except")):
            risk = f"Review {event.filePath}; the change may still contain incomplete or risky logic."
        elif classification == "breaking":
            risk = f"{event.filePath} was deleted; verify downstream dependencies."

        return LogUpdate(
            classification=classification,
            area=area,
            summary=f"Updated {event.filePath} with a {classification} change for the {area} layer.",
            whyItMatters=f"This keeps the {area} side of the project aligned with the current DevLog workflow.",
            todoAdds=_extract_markers(event.note, prefix="todo:"),
            todoResolves=_extract_markers(event.note, prefix="done:"),
            riskFlag=risk,
            createSnapshot=classification in {"feature", "fix"} and add_count + delete_count > 12,
        )

    def _fallback_query(self, state: ProjectState, question: str) -> str:
        q = question.lower()
        matching = []
        keywords = [token for token in re.findall(r"[a-zA-Z0-9_./-]+", q) if len(token) > 2]

        for item in state.timeline:
            haystack = " ".join(
                [
                    item.filePath.lower(),
                    item.summary.lower(),
                    item.whyItMatters.lower(),
                    (item.note or "").lower(),
                ]
            )
            if any(keyword in haystack for keyword in keywords):
                matching.append(item)

        if "last known working" in q or "working state" in q:
            return "\n".join(
                [
                    f"Current summary: {state.currentSummary}",
                    f"Frontend: {state.frontendStatus}",
                    f"Backend: {state.backendStatus}",
                    f"Last completed: {state.lastCompleted}",
                ]
            )

        if matching:
            lines = [f"- {item.timestamp}: {item.summary} ({item.filePath})" for item in matching[:5]]
            return "Relevant timeline events:\n" + "\n".join(lines)

        recent = state.timeline[:3]
        if not recent:
            return "No timeline history is available yet."

        return "Recent activity:\n" + "\n".join(
            f"- {item.timestamp}: {item.summary}" for item in recent
        )

    def _fallback_handoff(self, state: ProjectState) -> str:
        todo_lines = "\n".join(f"- [ ] {item}" for item in state.activeTodos[:6]) or "- [ ] No active TODOs."
        risk_lines = "\n".join(f"- {item}" for item in state.risks[:4]) or "- No active risks."
        recent_lines = "\n".join(
            f"- {item.timestamp}: {item.summary} ({item.filePath})" for item in state.timeline[:5]
        ) or "- No recent changes."

        return dedent(
            f"""
            ## Session Handoff

            **Current state**
            {state.currentSummary}

            **Frontend**
            {state.frontendStatus}

            **Backend**
            {state.backendStatus}

            **Last completed**
            {state.lastCompleted}

            **Open risks**
            {risk_lines}

            **Active TODOs**
            {todo_lines}

            **Recent changes**
            {recent_lines}

            **Next recommended steps**
            1. Resolve the highest-risk issue first.
            2. Finish or prune the active TODO list.
            3. Use the recent changes above as the starting context for the next AI session.
            """
        ).strip()


def _extract_markers(note: str | None, prefix: str) -> list[str]:
    if not note:
        return []

    extracted: list[str] = []
    for raw_line in note.splitlines():
        line = raw_line.strip()
        if line.lower().startswith(prefix):
            extracted.append(line[len(prefix) :].strip())
    return [item for item in extracted if item]


def _json_ready(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {key: _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    if isinstance(value, tuple):
        return [_json_ready(item) for item in value]
    return value
