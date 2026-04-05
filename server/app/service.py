from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from .analyzer import RepoAnalyzer
from .config import settings
from .llm import DevLogBrain
from .models import (
    ArchitectureMapResponse,
    ChangeEvent,
    DiagramResponse,
    ExplainFileResponse,
    LogUpdate,
    ProjectState,
    SearchCodeResponse,
    Snapshot,
    TimelineEvent,
    utc_now_iso,
)
from .storage import Store, build_store


class DevLogService:
    def __init__(self, store: Store | None = None, brain: DevLogBrain | None = None) -> None:
        self.store = store or build_store()
        self.brain = brain or DevLogBrain()
        self.analyzer = RepoAnalyzer()

    def get_state(self, project_id: str) -> ProjectState:
        state = self.store.get_project(project_id)
        if not state.markdown:
            state.markdown = self.render_markdown(state)
            self.store.save_project(state)
        return state

    def add_note(self, project_id: str, note: str) -> ProjectState:
        state = self.store.get_project(project_id)
        state.pendingNote = note.strip()
        state.markdown = self.render_markdown(state)
        return self.store.save_project(state)

    def list_timeline(self, project_id: str, limit: int = 25) -> list[TimelineEvent]:
        state = self.get_state(project_id)
        return state.timeline[:limit]

    def process_event(self, event: ChangeEvent) -> tuple[TimelineEvent, ProjectState]:
        state = self.store.get_project(event.projectId)
        attached_note = event.note or state.pendingNote
        if state.pendingNote and not event.note:
            state.pendingNote = None

        normalized_event = event.model_copy(update={"note": attached_note})
        update = self.brain.summarize_change(state, normalized_event)
        timeline_event = self._to_timeline_event(normalized_event, update)

        self._apply_update(state, timeline_event, update)
        state.markdown = self.render_markdown(state)

        if update.createSnapshot:
            snapshot = Snapshot(
                id=str(uuid4()),
                timestamp=utc_now_iso(),
                title=timeline_event.summary,
                markdown=state.markdown,
            )
            state.snapshots.insert(0, snapshot)
            state.snapshots = state.snapshots[:15]
            state.markdown = self.render_markdown(state)

        saved = self.store.save_project(state)
        self._mirror_markdown(saved.markdown)
        return timeline_event, saved

    def answer_query(self, project_id: str, question: str) -> str:
        state = self.get_state(project_id)
        return self.brain.answer_query(state, question)

    def generate_handoff(self, project_id: str) -> str:
        state = self.get_state(project_id)
        return self.brain.generate_handoff(state)

    def explain_file(
        self,
        file_path: str,
        selection_start: int | None = None,
        selection_end: int | None = None,
    ) -> ExplainFileResponse:
        payload = self.analyzer.explain_file(file_path, selection_start, selection_end)
        enhanced = self.brain.enhance_explanation(payload)
        return ExplainFileResponse.model_validate(enhanced)

    def generate_diagram(self, kind: str, file_path: str | None = None) -> DiagramResponse:
        payload = self.analyzer.generate_diagram(kind, file_path)
        enhanced = self.brain.enhance_diagram(payload)
        return DiagramResponse.model_validate(enhanced)

    def architecture_map(self) -> ArchitectureMapResponse:
        payload = self.analyzer.architecture_map()
        enhanced = self.brain.enhance_architecture(payload)
        return ArchitectureMapResponse.model_validate(enhanced)

    def search_code(self, query: str, limit: int) -> SearchCodeResponse:
        return SearchCodeResponse(matches=self.analyzer.search_code(query, limit))

    def render_markdown(self, state: ProjectState) -> str:
        timeline_lines = "\n".join(
            f"- {item.timestamp} | `{item.area}` | {item.summary} ({item.filePath})"
            for item in state.timeline[:10]
        ) or "- No events yet."

        todo_lines = "\n".join(f"- [ ] {item}" for item in state.activeTodos) or "- [ ] No active TODOs."
        resolved_lines = "\n".join(f"- [x] {item}" for item in state.resolvedTodos[:10]) or "- [x] No resolved TODOs yet."
        risk_lines = "\n".join(f"- {item}" for item in state.risks[:8]) or "- No open risks."
        snapshot_lines = "\n".join(
            f"- {snapshot.timestamp} | {snapshot.title}" for snapshot in state.snapshots[:5]
        ) or "- No milestone snapshots yet."

        return (
            f"# DevLog AI\n\n"
            f"## Project Overview\n"
            f"{state.currentSummary}\n\n"
            f"## Current Working State\n"
            f"- Frontend: {state.frontendStatus}\n"
            f"- Backend: {state.backendStatus}\n"
            f"- Shared: {state.sharedStatus}\n"
            f"- Infra: {state.infraStatus}\n"
            f"- Last completed: {state.lastCompleted}\n"
            f"- Pending note: {state.pendingNote or 'None'}\n\n"
            f"## Live TODO List\n"
            f"{todo_lines}\n\n"
            f"## Resolved TODOs\n"
            f"{resolved_lines}\n\n"
            f"## Danger Zones\n"
            f"{risk_lines}\n\n"
            f"## Recent Timeline\n"
            f"{timeline_lines}\n\n"
            f"## Session Snapshots\n"
            f"{snapshot_lines}\n"
        )

    def _to_timeline_event(self, event: ChangeEvent, update: LogUpdate) -> TimelineEvent:
        return TimelineEvent(
            id=str(uuid4()),
            projectId=event.projectId,
            timestamp=event.timestamp,
            filePath=event.filePath,
            changeType=event.changeType,
            note=event.note,
            classification=update.classification,
            area=update.area,
            summary=update.summary,
            whyItMatters=update.whyItMatters,
            riskFlag=update.riskFlag,
            createSnapshot=update.createSnapshot,
        )

    def _apply_update(self, state: ProjectState, event: TimelineEvent, update: LogUpdate) -> None:
        state.timeline.insert(0, event)
        state.timeline = state.timeline[:100]

        if update.area == "frontend":
            state.frontendStatus = event.summary
        elif update.area == "backend":
            state.backendStatus = event.summary
        elif update.area == "shared":
            state.sharedStatus = event.summary
        else:
            state.infraStatus = event.summary

        if event.classification in {"feature", "fix", "refactor"}:
            state.lastCompleted = event.summary

        for todo in update.todoAdds:
            if todo and todo not in state.activeTodos:
                state.activeTodos.append(todo)

        for todo in update.todoResolves:
            if todo in state.activeTodos:
                state.activeTodos.remove(todo)
            if todo and todo not in state.resolvedTodos:
                state.resolvedTodos.insert(0, todo)
                state.resolvedTodos = state.resolvedTodos[:25]

        if update.riskFlag and update.riskFlag not in state.risks:
            state.risks.insert(0, update.riskFlag)
            state.risks = state.risks[:10]

        state.currentSummary = (
            f"Last update at {event.timestamp}: {event.summary} "
            f"Current focus areas include {self._focus_summary(state)}."
        )

    def _focus_summary(self, state: ProjectState) -> str:
        focus = []
        if state.activeTodos:
            focus.append(f"{len(state.activeTodos)} active TODOs")
        if state.risks:
            focus.append(f"{len(state.risks)} open risks")
        if not focus:
            focus.append("stabilizing the latest working state")
        return ", ".join(focus)

    def _mirror_markdown(self, markdown: str) -> None:
        path = Path(settings.project_markdown)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(markdown, encoding="utf-8")
