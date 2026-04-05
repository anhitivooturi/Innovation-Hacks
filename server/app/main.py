from __future__ import annotations

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    ArchitectureMapRequest,
    ArchitectureMapResponse,
    ChangeEvent,
    DiagramRequest,
    DiagramResponse,
    EventResponse,
    ExplainFileRequest,
    ExplainFileResponse,
    HandoffRequest,
    HandoffResponse,
    NoteRequest,
    ProjectState,
    QueryRequest,
    QueryResponse,
    SearchCodeRequest,
    SearchCodeResponse,
    TimelineEvent,
)
from .service import DevLogService

app = FastAPI(title="DevLog AI API", version="0.1.0")
service = DevLogService()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/events", response_model=EventResponse)
def post_event(event: ChangeEvent) -> EventResponse:
    timeline_event, state = service.process_event(event)
    return EventResponse(event=timeline_event, state=state)


@app.post("/notes", response_model=ProjectState)
def post_note(note: NoteRequest) -> ProjectState:
    return service.add_note(note.projectId, note.note)


@app.get("/timeline", response_model=list[TimelineEvent])
def get_timeline(projectId: str = Query("default"), limit: int = Query(25, ge=1, le=100)) -> list[TimelineEvent]:
    return service.list_timeline(projectId, limit)


@app.get("/state", response_model=ProjectState)
def get_state(projectId: str = Query("default")) -> ProjectState:
    return service.get_state(projectId)


@app.post("/query", response_model=QueryResponse)
def post_query(payload: QueryRequest) -> QueryResponse:
    return QueryResponse(answer=service.answer_query(payload.projectId, payload.question))


@app.post("/handoff", response_model=HandoffResponse)
def post_handoff(payload: HandoffRequest) -> HandoffResponse:
    return HandoffResponse(handoff=service.generate_handoff(payload.projectId))


@app.post("/explain/file", response_model=ExplainFileResponse)
def post_explain_file(payload: ExplainFileRequest) -> ExplainFileResponse:
    return service.explain_file(
        payload.filePath,
        payload.selectionStartLine,
        payload.selectionEndLine,
    )


@app.post("/diagram", response_model=DiagramResponse)
def post_diagram(payload: DiagramRequest) -> DiagramResponse:
    return service.generate_diagram(payload.kind, payload.filePath)


@app.post("/architecture/map", response_model=ArchitectureMapResponse)
def post_architecture_map(_: ArchitectureMapRequest) -> ArchitectureMapResponse:
    return service.architecture_map()


@app.post("/search/code", response_model=SearchCodeResponse)
def post_search_code(payload: SearchCodeRequest) -> SearchCodeResponse:
    return service.search_code(payload.query, payload.limit)
