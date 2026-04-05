from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .brain import VertexBrain
from .config import settings
from .repo_tools import ApiRepoTools

try:
    import firebase_admin
    from firebase_admin import firestore
except Exception:  # pragma: no cover
    firebase_admin = None
    firestore = None


app = FastAPI(
    title="DevLog AI API",
    description="Local-first API for the DevLog VS Code extension.",
    version="2.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


DEVLOG_PATH = settings.devlog_path
CACHE_PATH = settings.cache_path
PROJECT_ROOT = settings.project_root

FIRESTORE_AVAILABLE = False
FIRESTORE_ERROR: str | None = None
db = None

if firebase_admin is not None and firestore is not None:
    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        db = firestore.client()
        FIRESTORE_AVAILABLE = True
        print("[DevLog API] Firestore initialized.")
    except Exception as exc:  # pragma: no cover - depends on local auth
        FIRESTORE_ERROR = str(exc)
        print(f"[DevLog API] Firestore unavailable: {exc}")
else:
    FIRESTORE_ERROR = "firebase-admin is not installed."


brain = VertexBrain()
repo_tools = ApiRepoTools(PROJECT_ROOT)


class ChangeEvent(BaseModel):
    project_id: str = "default"
    timestamp: str
    file_path: str
    event_type: str
    diff: str
    old_content: str | None = None
    new_content: str | None = None
    lines_added: int = 0
    lines_removed: int = 0


class ContextRequest(BaseModel):
    projectId: str = "default"
    fileTree: list[str] = Field(default_factory=list)
    diagnostics: list[dict[str, Any]] = Field(default_factory=list)
    gitLog: list[dict[str, Any]] = Field(default_factory=list)
    timestamp: str


class QueryRequest(BaseModel):
    projectId: str = "default"
    question: str | None = None
    query: str | None = None


class HandoffRequest(BaseModel):
    projectId: str = "default"
    recipient: str | None = None


class ExplainFileRequest(BaseModel):
    projectId: str = "default"
    filePath: str
    selectionStartLine: int | None = None
    selectionEndLine: int | None = None


class DiagramRequest(BaseModel):
    projectId: str = "default"
    kind: str
    filePath: str | None = None


class ArchitectureRequest(BaseModel):
    projectId: str = "default"


class SearchCodeRequest(BaseModel):
    projectId: str = "default"
    query: str
    limit: int = Field(default=8, ge=1, le=20)


class SnapshotRequest(BaseModel):
    projectId: str = "default"
    reason: str = "Manual snapshot"


class MCPLogDecision(BaseModel):
    projectId: str = "default"
    type: str
    content: str
    source: str


def iso_now() -> str:
    return datetime.now().isoformat()


def ensure_paths() -> None:
    DEVLOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not DEVLOG_PATH.exists():
        DEVLOG_PATH.write_text("", encoding="utf-8")
    if not CACHE_PATH.exists():
        CACHE_PATH.write_text(json.dumps({"projects": {}}), encoding="utf-8")


def read_devlog() -> str:
    ensure_paths()
    return DEVLOG_PATH.read_text(encoding="utf-8")


def write_devlog(content: str) -> None:
    ensure_paths()
    DEVLOG_PATH.write_text(content, encoding="utf-8")


def append_to_devlog(content: str) -> None:
    ensure_paths()
    with DEVLOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(content)


def load_cache() -> dict[str, Any]:
    ensure_paths()
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"projects": {}}


def save_cache(data: dict[str, Any]) -> None:
    ensure_paths()
    CACHE_PATH.write_text(json.dumps(data, ensure_ascii=True, indent=2), encoding="utf-8")


def default_project_record(project_id: str) -> dict[str, Any]:
    return {
        "projectId": project_id,
        "workspaceContext": {
            "fileTree": [],
            "diagnostics": [],
            "gitLog": [],
            "timestamp": None,
        },
        "timeline": [],
        "activeTodos": [],
        "risks": [],
        "updatedAt": None,
        "lastUpdated": None,
    }


def get_project_record(project_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    cache = load_cache()
    project = cache.setdefault("projects", {}).setdefault(project_id, default_project_record(project_id))
    return cache, project


def sync_document(collection: str, doc_id: str, data: dict[str, Any]) -> None:
    if not FIRESTORE_AVAILABLE or db is None:
        return
    try:
        db.collection(collection).document(doc_id).set(data, merge=True)
    except Exception as exc:
        mark_firestore_unavailable(exc)


def add_document(collection: str, data: dict[str, Any]) -> str | None:
    if not FIRESTORE_AVAILABLE or db is None:
        return None
    try:
        doc_ref = db.collection(collection).add(data)
        return doc_ref[1].id
    except Exception as exc:
        mark_firestore_unavailable(exc)
        return None


def update_document(collection: str, doc_id: str, data: dict[str, Any]) -> None:
    if not FIRESTORE_AVAILABLE or db is None:
        return
    try:
        db.collection(collection).document(doc_id).set(data, merge=True)
    except Exception as exc:
        mark_firestore_unavailable(exc)


def fetch_document(collection: str, doc_id: str) -> dict[str, Any] | None:
    if not FIRESTORE_AVAILABLE or db is None:
        return None
    try:
        snap = db.collection(collection).document(doc_id).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        data["id"] = snap.id
        return data
    except Exception as exc:
        mark_firestore_unavailable(exc)
        return None


def fetch_collection(
    collection: str,
    *,
    order_field: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    if not FIRESTORE_AVAILABLE or db is None:
        return []
    query = db.collection(collection)
    if order_field and firestore is not None:
        query = query.order_by(order_field, direction=firestore.Query.DESCENDING)
    query = query.limit(limit)
    items: list[dict[str, Any]] = []
    try:
        for snap in query.stream():
            data = snap.to_dict() or {}
            data["id"] = snap.id
            items.append(data)
    except Exception as exc:
        mark_firestore_unavailable(exc)
        return []
    return items


def mark_firestore_unavailable(exc: Exception) -> None:
    global FIRESTORE_AVAILABLE, FIRESTORE_ERROR, db
    FIRESTORE_AVAILABLE = False
    FIRESTORE_ERROR = str(exc)
    db = None
    print(f"[DevLog API] Firestore disabled at runtime: {exc}")


def probe_firestore_access() -> None:
    if not FIRESTORE_AVAILABLE or db is None:
        return
    try:
        list(db.collection("_devlog_healthcheck").limit(1).stream())
    except Exception as exc:
        mark_firestore_unavailable(exc)


def project_matches(item: dict[str, Any], project_id: str) -> bool:
    return item.get("project_id", project_id) == project_id


def format_change_entry(change: ChangeEvent) -> str:
    return (
        f"\n**{change.timestamp}** - {change.event_type.capitalize()} `{change.file_path}`\n"
        f"- Lines: +{change.lines_added} -{change.lines_removed}\n\n"
    )


def format_analysis_entry(change: ChangeEvent, analysis: dict[str, Any]) -> str:
    danger = ""
    if analysis.get("danger"):
        danger = f"\n- Risk: {analysis.get('reason', 'Review this change.')}"
    todos = analysis.get("todos") or []
    todo_line = ""
    if todos:
        todo_line = "\n- Todos: " + "; ".join(str(item) for item in todos[:4])
    return (
        f"### {analysis.get('classification', 'change').upper()} - `{change.file_path}`\n"
        f"- Summary: {analysis.get('summary', 'No summary available.')}"
        f"{danger}{todo_line}\n\n"
    )


def compute_health(risks: list[str], todos: list[str]) -> str:
    if risks:
        return "red"
    if len(todos) >= 5:
        return "yellow"
    return "green"


def unique_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def push_timeline_entry(project: dict[str, Any], entry: dict[str, Any]) -> None:
    remaining = [item for item in project["timeline"] if item.get("id") != entry.get("id")]
    project["timeline"] = [entry] + remaining
    project["timeline"] = project["timeline"][:40]


def build_local_payload(project_id: str) -> dict[str, Any]:
    _, project = get_project_record(project_id)
    content = read_devlog()
    project["updatedAt"] = project.get("updatedAt") or iso_now()
    project["lastUpdated"] = project.get("lastUpdated") or project["updatedAt"]
    return {
        "projectId": project_id,
        "content": content,
        "last_updated": project["lastUpdated"],
        "updatedAt": project["updatedAt"],
        "projectHealth": compute_health(project["risks"], project["activeTodos"]),
        "activeTodos": project["activeTodos"],
        "risks": project["risks"],
        "timeline": project["timeline"],
        "workspaceContext": project["workspaceContext"],
    }


def build_project_payload(project_id: str) -> dict[str, Any]:
    payload = build_local_payload(project_id)

    if not FIRESTORE_AVAILABLE:
        return payload

    try:
        devlog_doc = fetch_document("devlog", "current")
        status_doc = fetch_document("status", "current")
        context_doc = fetch_document("workspace_context", project_id)
        changes = [
            item
            for item in fetch_collection("changes", order_field="timestamp", limit=30)
            if project_matches(item, project_id)
        ]
        todos = [
            item
            for item in fetch_collection("todos", order_field="updatedAt", limit=30)
            if project_matches(item, project_id)
        ]
        danger_zones = [
            item
            for item in fetch_collection("danger_zones", order_field="created_at", limit=20)
            if project_matches(item, project_id) and not item.get("resolved", False)
        ]
    except Exception:
        return payload

    timeline = []
    for item in changes:
        timeline.append(
            {
                "id": item.get("id"),
                "timestamp": item.get("timestamp"),
                "filePath": item.get("filePath") or item.get("file") or "unknown",
                "classification": item.get("classification", "unknown"),
                "summary": item.get("summary", "No summary"),
                "riskFlag": item.get("reason") if item.get("danger") else None,
            }
        )

    active_todos = [
        item.get("title") or item.get("text") or item.get("task")
        for item in todos
        if (item.get("state") or item.get("status") or "todo") not in {"done", "completed", "resolved"}
    ]
    risks = [item.get("reason") or f"Review {item.get('file', 'unknown')}." for item in danger_zones]

    if devlog_doc:
        payload["content"] = devlog_doc.get("content", payload["content"])
        payload["last_updated"] = devlog_doc.get("last_updated") or devlog_doc.get("lastUpdated") or payload["last_updated"]
    if status_doc:
        payload["projectHealth"] = status_doc.get("projectHealth", payload["projectHealth"])
        payload["updatedAt"] = status_doc.get("lastUpdated") or status_doc.get("updatedAt") or payload["updatedAt"]
    if context_doc:
        payload["workspaceContext"] = {
            "fileTree": context_doc.get("fileTree", []),
            "diagnostics": context_doc.get("diagnostics", []),
            "gitLog": context_doc.get("gitLog", []),
            "timestamp": context_doc.get("timestamp"),
        }

    if timeline:
        payload["timeline"] = timeline
    if active_todos:
        payload["activeTodos"] = unique_list([item for item in active_todos if item])
    if risks:
        payload["risks"] = unique_list([item for item in risks if item])

    if not status_doc:
        payload["projectHealth"] = compute_health(payload["risks"], payload["activeTodos"])

    return payload


def build_prompt_context(project_id: str) -> dict[str, Any]:
    payload = build_project_payload(project_id)
    return {
        "project_id": project_id,
        "workspace_snapshot": payload.get("workspaceContext", {}),
        "recent_changes": payload.get("timeline", [])[:12],
        "active_todos": payload.get("activeTodos", [])[:10],
        "risks": payload.get("risks", [])[:10],
        "devlog_excerpt": payload.get("content", "")[-5000:],
    }


def collect_query_matches(question: str) -> list[dict[str, Any]]:
    keywords = [token.lower() for token in re.findall(r"[A-Za-z0-9_./-]+", question) if len(token) >= 4]
    seen: set[tuple[str, int | None]] = set()
    matches: list[dict[str, Any]] = []
    for keyword in keywords[:6]:
        try:
            for match in repo_tools.search_code(keyword, limit=2):
                item = json_ready(match)
                key = (item.get("filePath", ""), item.get("line"))
                if key in seen:
                    continue
                seen.add(key)
                matches.append(item)
                if len(matches) >= 8:
                    return matches
        except Exception:
            continue
    return matches


def publish_state(project_id: str) -> None:
    payload = build_local_payload(project_id)
    payload["projectHealth"] = compute_health(payload["risks"], payload["activeTodos"])
    payload["updatedAt"] = iso_now()
    payload["last_updated"] = payload["updatedAt"]

    cache, project = get_project_record(project_id)
    project["updatedAt"] = payload["updatedAt"]
    project["lastUpdated"] = payload["last_updated"]
    save_cache(cache)

    sync_document(
        "devlog",
        "current",
        {
            "project_id": project_id,
            "content": read_devlog(),
            "last_updated": payload["last_updated"],
        },
    )
    sync_document(
        "status",
        "current",
        {
            "project_id": project_id,
            "projectHealth": payload["projectHealth"],
            "lastUpdated": payload["updatedAt"],
            "timelineCount": len(payload["timeline"]),
            "todoCount": len(payload["activeTodos"]),
            "riskCount": len(payload["risks"]),
        },
    )


def enrich_change(change: ChangeEvent, change_id: str) -> None:
    analysis = brain.summarize_change(
        file_path=change.file_path,
        diff=change.diff,
        content=change.new_content or "",
        context=build_prompt_context(change.project_id),
    )
    append_to_devlog(format_analysis_entry(change, analysis))

    cache, project = get_project_record(change.project_id)
    entry = {
        "id": change_id,
        "timestamp": change.timestamp,
        "filePath": change.file_path,
        "classification": analysis.get("classification", "unknown"),
        "summary": analysis.get("summary", "No summary available."),
        "riskFlag": analysis.get("reason") if analysis.get("danger") else None,
    }
    push_timeline_entry(project, entry)
    project["activeTodos"] = unique_list(project["activeTodos"] + list(analysis.get("todos") or []))[:25]
    if analysis.get("danger") and analysis.get("reason"):
        project["risks"] = unique_list(project["risks"] + [analysis["reason"]])[:20]
    project["updatedAt"] = iso_now()
    project["lastUpdated"] = project["updatedAt"]
    save_cache(cache)

    update_document(
        "changes",
        change_id,
        {
            "project_id": change.project_id,
            "filePath": change.file_path,
            "summary": analysis.get("summary"),
            "classification": analysis.get("classification", "unknown"),
            "danger": bool(analysis.get("danger")),
            "reason": analysis.get("reason"),
            "todos": analysis.get("todos") or [],
            "affected_files": analysis.get("affected_files") or [change.file_path],
            "analyzed": True,
            "analyzed_at": iso_now(),
        },
    )
    for todo in analysis.get("todos") or []:
        add_document(
            "todos",
            {
                "project_id": change.project_id,
                "title": todo,
                "text": todo,
                "file": change.file_path,
                "state": "todo",
                "updatedAt": iso_now(),
            },
        )
    if analysis.get("danger"):
        add_document(
            "danger_zones",
            {
                "project_id": change.project_id,
                "file": change.file_path,
                "reason": analysis.get("reason", "Review this change."),
                "created_at": iso_now(),
                "resolved": False,
            },
        )

    publish_state(change.project_id)


def normalize_query(request: QueryRequest) -> str:
    text = (request.question or request.query or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Request requires `question` or `query`.")
    return text


def json_ready(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, dict):
        return {key: json_ready(val) for key, val in value.items()}
    return value


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "name": "DevLog AI API",
        "status": "running",
        "canonical_stack": "api+watcher",
        "project_root": str(PROJECT_ROOT),
        "endpoints": [
            "POST /change",
            "POST /context",
            "GET /devlog",
            "POST /query",
            "POST /handoff",
            "POST /explain/file",
            "POST /diagram",
            "POST /architecture/map",
            "POST /search/code",
            "GET /health",
        ],
    }


@app.post("/change")
async def receive_change(change: ChangeEvent, background_tasks: BackgroundTasks) -> dict[str, Any]:
    ensure_paths()
    append_to_devlog(format_change_entry(change))

    cache, project = get_project_record(change.project_id)
    pending_entry = {
        "id": f"{change.project_id}:{change.timestamp}:{change.file_path}",
        "timestamp": change.timestamp,
        "filePath": change.file_path,
        "classification": "pending",
        "summary": f"{change.event_type.capitalize()} {change.file_path}",
        "riskFlag": None,
    }
    push_timeline_entry(project, pending_entry)
    project["updatedAt"] = iso_now()
    project["lastUpdated"] = project["updatedAt"]
    save_cache(cache)

    change_id = add_document(
        "changes",
        {
            "project_id": change.project_id,
            "timestamp": change.timestamp,
            "file": change.file_path,
            "filePath": change.file_path,
            "event_type": change.event_type,
            "lines_added": change.lines_added,
            "lines_removed": change.lines_removed,
            "diff": change.diff[:4000],
            "summary": f"{change.event_type.capitalize()} {change.file_path}",
            "classification": "pending",
            "danger": False,
            "analyzed": False,
        },
    ) or pending_entry["id"]

    publish_state(change.project_id)
    background_tasks.add_task(enrich_change, change, change_id)
    return {
        "status": "success",
        "message": f"Change logged for {change.file_path}",
        "timestamp": iso_now(),
    }


@app.post("/context")
async def store_context(payload: ContextRequest) -> dict[str, Any]:
    cache, project = get_project_record(payload.projectId)
    project["workspaceContext"] = {
        "fileTree": payload.fileTree,
        "diagnostics": payload.diagnostics,
        "gitLog": payload.gitLog,
        "timestamp": payload.timestamp,
    }
    project["updatedAt"] = payload.timestamp
    project["lastUpdated"] = payload.timestamp
    save_cache(cache)

    sync_document(
        "workspace_context",
        payload.projectId,
        {
            "project_id": payload.projectId,
            "fileTree": payload.fileTree,
            "diagnostics": payload.diagnostics,
            "gitLog": payload.gitLog,
            "timestamp": payload.timestamp,
        },
    )
    publish_state(payload.projectId)
    return {"status": "success", "message": "Workspace context stored.", "timestamp": payload.timestamp}


@app.get("/devlog")
async def get_devlog(projectId: str = Query(default="default")) -> dict[str, Any]:
    payload = build_project_payload(projectId)
    payload["content"] = read_devlog()
    return payload


@app.post("/query")
async def query_project(request: QueryRequest) -> dict[str, Any]:
    question = normalize_query(request)
    context = build_prompt_context(request.projectId)
    context["code_matches"] = collect_query_matches(question)
    answer = brain.answer_query(question=question, context=context)
    return {
        "status": "success",
        "timestamp": iso_now(),
        "question": question,
        "answer": answer,
    }


@app.post("/handoff")
async def generate_handoff_doc(request: HandoffRequest) -> dict[str, Any]:
    handoff = brain.generate_handoff(context=build_prompt_context(request.projectId))
    return {
        "status": "success",
        "timestamp": iso_now(),
        "recipient": request.recipient,
        "handoff_document": handoff,
        "handoff": handoff,
    }


@app.post("/explain/file")
async def explain_file(request: ExplainFileRequest) -> dict[str, Any]:
    try:
        payload = repo_tools.explain_file(
            request.filePath,
            request.selectionStartLine,
            request.selectionEndLine,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {request.filePath}") from None

    enhanced = brain.enhance_explanation(json_ready(payload), build_prompt_context(request.projectId))
    return json_ready(enhanced)


@app.post("/diagram")
async def generate_diagram(request: DiagramRequest) -> dict[str, Any]:
    supported = {"dependency", "flow", "class", "sequence"}
    if request.kind not in supported:
        raise HTTPException(status_code=400, detail=f"Unsupported diagram kind: {request.kind}")

    try:
        payload = repo_tools.generate_diagram(request.kind, request.filePath)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {request.filePath}") from None
    enhanced = brain.enhance_diagram(json_ready(payload), build_prompt_context(request.projectId))
    return json_ready(enhanced)


@app.post("/architecture/map")
async def architecture_map(request: ArchitectureRequest) -> dict[str, Any]:
    payload = repo_tools.architecture_map()
    enhanced = brain.enhance_architecture(json_ready(payload), build_prompt_context(request.projectId))
    return json_ready(enhanced)


@app.post("/search/code")
async def search_code(request: SearchCodeRequest) -> dict[str, Any]:
    matches = repo_tools.search_code(request.query, limit=request.limit)
    return {"matches": json_ready(matches)}


@app.post("/snapshot")
async def create_snapshot(request: SnapshotRequest) -> dict[str, Any]:
    content = read_devlog()
    snapshot = {
        "project_id": request.projectId,
        "reason": request.reason,
        "content": content,
        "timestamp": iso_now(),
        "title": request.reason,
    }
    snapshot_id = add_document("snapshots", snapshot)
    if snapshot_id is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable; snapshot was not created.")
    return {
        "status": "success",
        "snapshot_id": snapshot_id,
        "timestamp": snapshot["timestamp"],
        "reason": request.reason,
    }


@app.get("/snapshots")
async def list_snapshots(projectId: str = Query(default="default")) -> dict[str, Any]:
    items = [
        item
        for item in fetch_collection("snapshots", order_field="timestamp", limit=25)
        if project_matches(item, projectId)
    ]
    return {"snapshots": items}


@app.post("/restore/{snapshot_id}")
async def restore_snapshot(snapshot_id: str) -> dict[str, Any]:
    snapshot = fetch_document("snapshots", snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    content = snapshot.get("content", "")
    write_devlog(content)
    project_id = snapshot.get("project_id", "default")
    publish_state(project_id)
    return {"status": "success", "snapshot_id": snapshot_id, "timestamp": iso_now()}


@app.post("/mcp/log_decision")
async def mcp_log_decision(decision: MCPLogDecision) -> dict[str, Any]:
    timestamp = iso_now()
    entry = (
        f"**{timestamp}** - Decision `{decision.type}`\n"
        f"- Source: {decision.source}\n"
        f"- {decision.content}\n\n"
    )
    append_to_devlog(entry)
    add_document(
        "decisions",
        {
            "project_id": decision.projectId,
            "type": decision.type,
            "content": decision.content,
            "source": decision.source,
            "timestamp": timestamp,
        },
    )
    publish_state(decision.projectId)
    return {"status": "success", "message": f"Decision logged: {decision.type}", "timestamp": timestamp}


@app.get("/mcp/get_project_context/{project_id}")
async def mcp_get_project_context(project_id: str) -> dict[str, Any]:
    payload = build_project_payload(project_id)
    return {
        "project_id": project_id,
        "content": payload.get("content", ""),
        "last_updated": payload.get("last_updated"),
        "workspace_context": payload.get("workspaceContext", {}),
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "canonical_stack": "api+watcher",
        "timestamp": iso_now(),
        "project_root": str(PROJECT_ROOT),
        "firestore_available": FIRESTORE_AVAILABLE,
        "firestore_error": FIRESTORE_ERROR,
        "vertex_available": brain.available,
        "vertex_error": brain.init_error,
        "project": settings.google_cloud_project,
        "location": settings.gcp_location,
        "fast_model": settings.gemini_fast_model,
        "pro_model": settings.gemini_pro_model,
    }


@app.on_event("startup")
async def startup_event() -> None:
    ensure_paths()
    probe_firestore_access()
    print("[DevLog API] Startup complete.")
    print(f"[DevLog API] Project root: {PROJECT_ROOT}")
    print(f"[DevLog API] Devlog path: {DEVLOG_PATH}")
    print(
        f"[DevLog API] Firestore={'enabled' if FIRESTORE_AVAILABLE else 'disabled'} "
        f"Vertex={'enabled' if brain.available else 'disabled'}"
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level="info",
    )
