from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

ChangeType = Literal["create", "modify", "delete"]
Classification = Literal["feature", "fix", "refactor", "config", "breaking", "revert", "unknown"]
Area = Literal["frontend", "backend", "shared", "infra", "human_loop"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ChangeEvent(BaseModel):
    projectId: str = "default"
    timestamp: str = Field(default_factory=utc_now_iso)
    filePath: str
    changeType: ChangeType
    diffText: str
    note: str | None = None


class LogUpdate(BaseModel):
    classification: Classification
    area: Area
    summary: str
    whyItMatters: str
    todoAdds: list[str] = Field(default_factory=list)
    todoResolves: list[str] = Field(default_factory=list)
    riskFlag: str | None = None
    createSnapshot: bool = False


class TimelineEvent(BaseModel):
    id: str
    projectId: str
    timestamp: str
    filePath: str
    changeType: ChangeType
    note: str | None = None
    classification: Classification
    area: Area
    summary: str
    whyItMatters: str
    riskFlag: str | None = None
    createSnapshot: bool = False


class Snapshot(BaseModel):
    id: str
    timestamp: str
    title: str
    markdown: str


class ProjectState(BaseModel):
    projectId: str = "default"
    currentSummary: str = "DevLog has not processed any project events yet."
    frontendStatus: str = "No frontend events recorded."
    backendStatus: str = "No backend events recorded."
    sharedStatus: str = "No shared events recorded."
    infraStatus: str = "No infrastructure events recorded."
    activeTodos: list[str] = Field(default_factory=list)
    resolvedTodos: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    lastCompleted: str = "No completed milestone yet."
    pendingNote: str | None = None
    markdown: str = ""
    updatedAt: str = Field(default_factory=utc_now_iso)
    timeline: list[TimelineEvent] = Field(default_factory=list)
    snapshots: list[Snapshot] = Field(default_factory=list)


class EventResponse(BaseModel):
    event: TimelineEvent
    state: ProjectState


class NoteRequest(BaseModel):
    projectId: str = "default"
    note: str


class QueryRequest(BaseModel):
    projectId: str = "default"
    question: str


class QueryResponse(BaseModel):
    answer: str


class HandoffRequest(BaseModel):
    projectId: str = "default"


class HandoffResponse(BaseModel):
    handoff: str


DiagramKind = Literal["dependency", "flow", "class", "sequence"]


class CodeReference(BaseModel):
    filePath: str
    line: int | None = None
    snippet: str | None = None


class ExplainFileRequest(BaseModel):
    projectId: str = "default"
    filePath: str
    selectionStartLine: int | None = None
    selectionEndLine: int | None = None


class ExplainFileResponse(BaseModel):
    title: str
    summary: str
    bullets: list[str] = Field(default_factory=list)
    codeContext: str = ""
    mermaid: str | None = None
    references: list[CodeReference] = Field(default_factory=list)


class DiagramRequest(BaseModel):
    projectId: str = "default"
    filePath: str | None = None
    kind: DiagramKind


class DiagramResponse(BaseModel):
    title: str
    kind: DiagramKind
    mermaid: str
    explanation: str
    references: list[CodeReference] = Field(default_factory=list)


class SearchCodeRequest(BaseModel):
    projectId: str = "default"
    query: str
    limit: int = Field(default=8, ge=1, le=20)


class SearchCodeResponse(BaseModel):
    matches: list[CodeReference] = Field(default_factory=list)


class ArchitectureMapRequest(BaseModel):
    projectId: str = "default"


class ArchitectureMapResponse(BaseModel):
    title: str
    summary: str
    mermaid: str
    entrypoints: list[str] = Field(default_factory=list)
    hotspots: list[str] = Field(default_factory=list)
