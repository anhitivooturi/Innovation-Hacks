"""
DevLog AI - FastAPI Backend
Receives file changes, logs decisions, and maintains the living devlog document.
Syncs all data to Firestore for real-time updates.
"""

import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import Gemini agent
sys.path.append(str(Path(__file__).parent.parent))
from agent.gemini import analyze_change_with_gemini, answer_query, generate_handoff

# Firebase Admin SDK
import firebase_admin
from firebase_admin import credentials, firestore

# ============================================================================
# Firebase Initialization
# ============================================================================

FIRESTORE_AVAILABLE = False
db = None

try:
    # Initialize Firebase Admin SDK (uses default credentials)
    # In Cloud Run: automatic via service account
    # Locally: set GOOGLE_APPLICATION_CREDENTIALS env var

    if not firebase_admin._apps:
        firebase_admin.initialize_app()

    db = firestore.client()
    FIRESTORE_AVAILABLE = True

    print("✅ Firestore initialized")

except Exception as e:
    print(f"⚠️  Firestore initialization failed: {e}")
    print("📝 Firestore features disabled - using local-only mode")


# Initialize FastAPI app
app = FastAPI(
    title="DevLog AI API",
    description="Background agent that tracks project changes and maintains a living devlog",
    version="1.0.0"
)

# Enable CORS on all routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constants
DEVLOG_PATH = Path("devlog/project.md")
PROJECT_ROOT = Path.cwd()


# ============================================================================
# Request/Response Models
# ============================================================================

class ChangeEvent(BaseModel):
    """File change event from the watcher"""
    timestamp: str
    file_path: str
    event_type: str  # created, modified, deleted
    diff: str
    old_content: Optional[str] = None
    new_content: Optional[str] = None
    lines_added: int = 0
    lines_removed: int = 0


class QueryRequest(BaseModel):
    """Query request for asking questions about the project"""
    question: str


class HandoffRequest(BaseModel):
    """Handoff document generation request"""
    recipient: Optional[str] = None


class MCPLogDecision(BaseModel):
    """MCP server decision log entry"""
    type: str  # e.g., "architecture", "refactor", "bugfix"
    content: str
    source: str  # e.g., "Claude Code", "VS Code Extension"


class StatusResponse(BaseModel):
    """Standard status response"""
    status: str
    message: str
    timestamp: str


class DevlogResponse(BaseModel):
    """Devlog content response"""
    content: str
    last_updated: str


class ProjectContextResponse(BaseModel):
    """Project context for MCP servers"""
    project_id: str
    content: str
    last_updated: str


# ============================================================================
# Helper Functions
# ============================================================================

def ensure_devlog_exists():
    """Ensure the devlog file and directory exist"""
    DEVLOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not DEVLOG_PATH.exists():
        print("⚠️  devlog/project.md not found - creating empty file")
        DEVLOG_PATH.write_text("", encoding='utf-8')


def read_devlog() -> str:
    """Read the current devlog content"""
    ensure_devlog_exists()
    return DEVLOG_PATH.read_text(encoding='utf-8')


def append_to_devlog(content: str):
    """Append content to the devlog"""
    ensure_devlog_exists()

    with open(DEVLOG_PATH, 'a', encoding='utf-8') as f:
        f.write(content)


def sync_to_firestore(collection: str, doc_id: str, data: dict):
    """
    Sync data to Firestore collection.
    Gracefully handles Firestore being unavailable.

    Args:
        collection: Firestore collection name
        doc_id: Document ID
        data: Data to write
    """
    if not FIRESTORE_AVAILABLE:
        return

    try:
        db.collection(collection).document(doc_id).set(data, merge=True)
        print(f"✅ Synced to Firestore: {collection}/{doc_id}")
    except Exception as e:
        print(f"⚠️  Firestore sync failed: {collection}/{doc_id} - {e}")


def add_to_firestore_collection(collection: str, data: dict) -> Optional[str]:
    """
    Add document to Firestore collection with auto-generated ID.

    Args:
        collection: Firestore collection name
        data: Data to write

    Returns:
        Document ID if successful, None otherwise
    """
    if not FIRESTORE_AVAILABLE:
        return None

    try:
        doc_ref = db.collection(collection).add(data)
        doc_id = doc_ref[1].id
        print(f"✅ Added to Firestore: {collection}/{doc_id}")
        return doc_id
    except Exception as e:
        print(f"⚠️  Firestore add failed: {collection} - {e}")
        return None


def format_change_entry(change: ChangeEvent) -> str:
    """Format a change event as plain English markdown entry"""
    timestamp = datetime.fromisoformat(change.timestamp).strftime("%Y-%m-%d %H:%M:%S")

    # Determine action verb
    if change.event_type == "created":
        action = "Created"
    elif change.event_type == "modified":
        action = "Modified"
    elif change.event_type == "deleted":
        action = "Deleted"
    else:
        action = "Changed"

    # Build plain English entry
    entry = f"""
**{timestamp}** — {action} `{change.file_path}`
- Lines: +{change.lines_added} -{change.lines_removed}

"""
    return entry


def enrich_with_gemini(filepath: str, diff: str, content: str, change_id: str):
    """
    Background task to enrich the devlog with Gemini structured analysis.
    Uses Gemini to analyze the change and append structured insights to devlog.
    Also syncs structured data to Firestore.

    Args:
        filepath: Path to changed file
        diff: Diff content
        content: Full file content
        change_id: ID of the change document in Firestore
    """
    try:
        print(f"🤖 Background: Analyzing {filepath} with Gemini...")

        # Get structured analysis from Gemini
        analysis = analyze_change_with_gemini(filepath, content, diff)

        # Build enriched entry
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        iso_timestamp = datetime.now().isoformat()

        danger_warning = ""
        if analysis.get("danger", False):
            danger_warning = f"\n⚠️  **DANGER**: {analysis.get('reason', 'Unknown risk')}"

        todos_section = ""
        if analysis.get("todos") and len(analysis["todos"]) > 0:
            todos_section = "\n📝 **Action Items**:\n" + "\n".join([f"  - {todo}" for todo in analysis["todos"]])

        affected_section = ""
        if analysis.get("affected_files") and len(analysis["affected_files"]) > 1:
            affected_section = "\n🔗 **May affect**: " + ", ".join([f"`{f}`" for f in analysis["affected_files"][:3]])

        entry = f"""

### {timestamp} — {analysis.get('classification', 'change').upper()}

**File**: `{filepath}`

**Summary**: {analysis.get('summary', 'No summary available')}{danger_warning}{todos_section}{affected_section}

---
"""

        # Append to devlog file
        append_to_devlog(entry)

        # Sync structured data to Firestore collections
        if FIRESTORE_AVAILABLE:
            # Update the change document with analysis
            sync_to_firestore("changes", change_id, {
                "summary": analysis.get("summary", "No summary"),
                "classification": analysis.get("classification", "modification"),
                "danger": analysis.get("danger", False),
                "reason": analysis.get("reason", ""),
                "analyzed_at": iso_timestamp
            })

            # Add todos to todos collection
            if analysis.get("todos"):
                for todo in analysis["todos"]:
                    add_to_firestore_collection("todos", {
                        "title": todo,  # Frontend expects 'title'
                        "text": todo,
                        "file": filepath,
                        "change_id": change_id,
                        "state": "todo",  # Frontend expects 'state'
                        "completed": False,
                        "createdAt": iso_timestamp,
                        "updatedAt": iso_timestamp,  # Frontend queries by updatedAt
                        "timestamp": iso_timestamp
                    })

            # Add to danger_zones if dangerous
            if analysis.get("danger", False):
                add_to_firestore_collection("danger_zones", {
                    "file": filepath,
                    "reason": analysis.get("reason", "Unknown risk"),
                    "change_id": change_id,
                    "created_at": iso_timestamp,
                    "resolved": False
                })

            # Update devlog/current document
            devlog_content = read_devlog()
            sync_to_firestore("devlog", "current", {
                "content": devlog_content,
                "last_updated": iso_timestamp,
                "last_change": filepath,
                "last_classification": analysis.get("classification", "modification")
            })

        print(f"✅ Background: Gemini analysis appended for {filepath}")
        print(f"   Classification: {analysis.get('classification', 'unknown')}")
        print(f"   Danger: {analysis.get('danger', False)}")

    except Exception as e:
        print(f"❌ Background: Gemini enrichment failed for {filepath}: {e}")


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint with API info"""
    print("📍 GET / - API info requested")
    return {
        "name": "DevLog AI API",
        "version": "1.0.0",
        "status": "running",
        "firestore_enabled": FIRESTORE_AVAILABLE,
        "endpoints": {
            "POST /change": "Receive file change events from watcher",
            "GET /devlog": "Get current devlog content",
            "POST /query": "Ask questions about the project",
            "POST /handoff": "Generate handoff documentation",
            "POST /snapshot": "Create a devlog snapshot",
            "GET /snapshots": "List all snapshots",
            "POST /restore/{snapshot_id}": "Restore from snapshot",
            "POST /mcp/log_decision": "Log a decision from MCP server",
            "GET /mcp/get_project_context/{project_id}": "Get project context for MCP",
            "GET /health": "Health check"
        }
    }


@app.post("/change", response_model=StatusResponse)
async def receive_change(change: ChangeEvent, background_tasks: BackgroundTasks):
    """
    Receive a file change event from the watcher.
    Immediately writes to Firestore and devlog, then enriches with Gemini in background.
    """
    try:
        print(f"📝 POST /change - {change.file_path} ({change.event_type})")

        timestamp = datetime.now().isoformat()

        # STEP 1: Write raw diff to devlog file immediately (never block)
        entry = format_change_entry(change)
        append_to_devlog(entry)

        print(f"✅ Logged raw change: {change.file_path}")

        # STEP 2: Sync to Firestore immediately (initial entry)
        change_data = {
            "timestamp": timestamp,
            "file": change.file_path,
            "event_type": change.event_type,
            "lines_added": change.lines_added,
            "lines_removed": change.lines_removed,
            "diff": change.diff[:2000],  # Truncate long diffs
            "summary": f"{change.event_type.capitalize()} {change.file_path}",
            "classification": "pending",  # Will be updated by Gemini
            "danger": False,
            "analyzed": False
        }

        # Add to changes collection and get the document ID
        change_id = add_to_firestore_collection("changes", change_data)

        if not change_id:
            # Fallback: use timestamp as ID
            change_id = timestamp.replace(":", "-").replace(".", "-")

        print(f"✅ Synced to Firestore: changes/{change_id}")

        # STEP 3: Schedule Gemini enrichment as background task
        background_tasks.add_task(
            enrich_with_gemini,
            filepath=change.file_path,
            diff=change.diff,
            content=change.new_content or "",
            change_id=change_id
        )

        print(f"🔄 Scheduled Gemini enrichment for: {change.file_path}")

        # STEP 4: Return immediately (watcher never times out)
        return StatusResponse(
            status="success",
            message=f"Change logged: {change.file_path}",
            timestamp=timestamp
        )

    except Exception as e:
        print(f"❌ Error logging change: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to log change: {str(e)}")


@app.get("/devlog", response_model=DevlogResponse)
async def get_devlog():
    """
    Get the current devlog content.
    Returns the full project.md content.
    """
    try:
        print("📖 GET /devlog - Returning full devlog")

        content = read_devlog()

        # Get last updated time
        stat = DEVLOG_PATH.stat()
        last_updated = datetime.fromtimestamp(stat.st_mtime).isoformat()

        print(f"✅ Devlog retrieved: {len(content)} chars")

        return DevlogResponse(
            content=content,
            last_updated=last_updated
        )

    except Exception as e:
        print(f"❌ Error reading devlog: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to read devlog: {str(e)}")


@app.post("/query")
async def query_project(query: QueryRequest):
    """
    Ask a question about the project using Gemini.
    """
    try:
        print(f"🤔 POST /query - Question: {query.question}")

        # Read current devlog
        devlog_content = read_devlog()

        # Use Gemini to answer the question
        answer = answer_query(
            question=query.question,
            devlog_content=devlog_content
        )

        timestamp = datetime.now().isoformat()

        print(f"✅ Query answered")

        return {
            "status": "success",
            "message": "Query answered",
            "timestamp": timestamp,
            "question": query.question,
            "answer": answer
        }

    except Exception as e:
        print(f"❌ Error answering query: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to answer query: {str(e)}")


@app.post("/handoff")
async def generate_handoff_doc(request: HandoffRequest):
    """
    Generate a handoff document for the project using Gemini.
    """
    try:
        print(f"📋 POST /handoff - Recipient: {request.recipient or 'team'}")

        # Read current devlog
        devlog_content = read_devlog()

        # Use Gemini to generate handoff document
        handoff_doc = generate_handoff(devlog_content)

        timestamp = datetime.now().isoformat()

        print(f"✅ Handoff document generated")

        return {
            "status": "success",
            "message": "Handoff document generated",
            "timestamp": timestamp,
            "recipient": request.recipient,
            "handoff_document": handoff_doc
        }

    except Exception as e:
        print(f"❌ Error generating handoff: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate handoff: {str(e)}")


@app.post("/mcp/log_decision", response_model=StatusResponse)
async def mcp_log_decision(decision: MCPLogDecision):
    """
    MCP endpoint to log a decision to the devlog.
    Allows AI tools to log architectural decisions and important choices.
    Also syncs to Firestore decisions collection.
    """
    try:
        print(f"💡 POST /mcp/log_decision - {decision.type} from {decision.source}")

        timestamp = datetime.now().isoformat()
        formatted_time = datetime.fromisoformat(timestamp).strftime("%Y-%m-%d %H:%M:%S")

        # Format decision entry
        entry = f"""
**{formatted_time}** — Decision: {decision.type}
- Source: {decision.source}
- {decision.content}

"""

        # Append to devlog
        append_to_devlog(entry)

        # Sync to Firestore decisions collection
        decision_data = {
            "type": decision.type,
            "content": decision.content,
            "source": decision.source,
            "timestamp": timestamp,
            "created_at": timestamp
        }
        add_to_firestore_collection("decisions", decision_data)

        print(f"✅ Decision logged: {decision.type}")

        return StatusResponse(
            status="success",
            message=f"Decision logged: {decision.type}",
            timestamp=timestamp
        )

    except Exception as e:
        print(f"❌ Error logging decision: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to log decision: {str(e)}")


@app.get("/mcp/get_project_context/{project_id}", response_model=ProjectContextResponse)
async def mcp_get_project_context(project_id: str):
    """
    MCP endpoint to get full project context.
    Returns the complete devlog for AI tools to understand the project.
    """
    try:
        print(f"🔍 GET /mcp/get_project_context/{project_id}")

        content = read_devlog()

        # Get last updated time
        stat = DEVLOG_PATH.stat()
        last_updated = datetime.fromtimestamp(stat.st_mtime).isoformat()

        print(f"✅ Project context retrieved for: {project_id}")

        return ProjectContextResponse(
            project_id=project_id,
            content=content,
            last_updated=last_updated
        )

    except Exception as e:
        print(f"❌ Error getting project context: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get project context: {str(e)}")


@app.post("/snapshot")
async def create_snapshot(reason: str = "Manual snapshot"):
    """
    Create a snapshot of the current devlog state.
    Saves to Firestore snapshots collection.
    """
    try:
        print(f"📸 POST /snapshot - Reason: {reason}")

        timestamp = datetime.now().isoformat()

        # Read current devlog
        devlog_content = read_devlog()

        # Create snapshot data
        snapshot_data = {
            "content": devlog_content,
            "timestamp": timestamp,
            "reason": reason,
            "created_at": timestamp
        }

        # Save to Firestore snapshots collection
        snapshot_id = add_to_firestore_collection("snapshots", snapshot_data)

        if not snapshot_id:
            raise HTTPException(status_code=500, detail="Failed to create snapshot (Firestore unavailable)")

        print(f"✅ Snapshot created: {snapshot_id}")

        return {
            "status": "success",
            "message": "Snapshot created",
            "timestamp": timestamp,
            "snapshot_id": snapshot_id,
            "reason": reason
        }

    except Exception as e:
        print(f"❌ Error creating snapshot: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create snapshot: {str(e)}")


@app.get("/snapshots")
async def list_snapshots():
    """
    List all snapshots with metadata.
    Returns list of snapshots from Firestore.
    """
    try:
        print("📋 GET /snapshots - Listing all snapshots")

        if not FIRESTORE_AVAILABLE:
            return {
                "status": "unavailable",
                "message": "Firestore not available",
                "snapshots": []
            }

        # Query snapshots collection
        snapshots_ref = db.collection("snapshots").order_by("timestamp", direction=firestore.Query.DESCENDING).limit(20)
        snapshots = []

        for doc in snapshots_ref.stream():
            snapshot = doc.to_dict()
            snapshots.append({
                "id": doc.id,
                "timestamp": snapshot.get("timestamp"),
                "reason": snapshot.get("reason"),
                "created_at": snapshot.get("created_at")
            })

        print(f"✅ Retrieved {len(snapshots)} snapshots")

        return {
            "status": "success",
            "count": len(snapshots),
            "snapshots": snapshots
        }

    except Exception as e:
        print(f"❌ Error listing snapshots: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list snapshots: {str(e)}")


@app.post("/restore/{snapshot_id}")
async def restore_snapshot(snapshot_id: str):
    """
    Restore devlog from a snapshot.
    Overwrites current devlog with snapshot content.
    """
    try:
        print(f"♻️  POST /restore/{snapshot_id}")

        if not FIRESTORE_AVAILABLE:
            raise HTTPException(status_code=503, detail="Firestore not available")

        # Get snapshot from Firestore
        snapshot_ref = db.collection("snapshots").document(snapshot_id)
        snapshot = snapshot_ref.get()

        if not snapshot.exists:
            raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")

        snapshot_data = snapshot.to_dict()
        content = snapshot_data.get("content", "")

        # Write to devlog file
        ensure_devlog_exists()
        DEVLOG_PATH.write_text(content, encoding='utf-8')

        timestamp = datetime.now().isoformat()

        print(f"✅ Restored from snapshot: {snapshot_id}")

        return {
            "status": "success",
            "message": f"Restored from snapshot {snapshot_id}",
            "timestamp": timestamp,
            "snapshot_id": snapshot_id,
            "restored_from": snapshot_data.get("timestamp")
        }

    except Exception as e:
        print(f"❌ Error restoring snapshot: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to restore snapshot: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "devlog_exists": DEVLOG_PATH.exists(),
        "firestore_available": FIRESTORE_AVAILABLE
    }


# ============================================================================
# Startup
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    print("\n🚀 DevLog AI API Starting...")
    print(f"📁 Project Root: {PROJECT_ROOT}")
    print(f"📝 Devlog Path: {DEVLOG_PATH.absolute()}")
    print(f"🔥 Firestore: {'✅ Enabled' if FIRESTORE_AVAILABLE else '❌ Disabled (local-only mode)'}")

    # Ensure devlog exists
    ensure_devlog_exists()

    print("✅ API Ready!\n")


if __name__ == "__main__":
    import uvicorn

    print("Starting DevLog AI API server...")
    print("📍 http://localhost:8000")
    print("📚 Docs: http://localhost:8000/docs")
    print("🔧 ReDoc: http://localhost:8000/redoc\n")

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
