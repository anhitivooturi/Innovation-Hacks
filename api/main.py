"""
DevLog AI - FastAPI Backend
Receives file changes, logs decisions, and maintains the living devlog document.
"""

from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


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
        "endpoints": {
            "POST /change": "Receive file change events from watcher",
            "GET /devlog": "Get current devlog content",
            "POST /query": "Ask questions about the project",
            "POST /handoff": "Generate handoff documentation",
            "POST /mcp/log_decision": "Log a decision from MCP server",
            "GET /mcp/get_project_context/{project_id}": "Get project context for MCP"
        }
    }


@app.post("/change", response_model=StatusResponse)
async def receive_change(change: ChangeEvent):
    """
    Receive a file change event from the watcher.
    Appends a plain English entry to devlog/project.md.
    """
    try:
        print(f"📝 POST /change - {change.file_path} ({change.event_type})")

        # Format the change as a plain English entry
        entry = format_change_entry(change)

        # Append to devlog under "Recent Changes" section
        append_to_devlog(entry)

        timestamp = datetime.now().isoformat()

        print(f"✅ Logged change: {change.file_path}")

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


@app.post("/query", response_model=StatusResponse)
async def query_project(query: QueryRequest):
    """
    Ask a question about the project.
    Placeholder for future Gemini integration.
    """
    print(f"🤔 POST /query - Question: {query.question}")

    timestamp = datetime.now().isoformat()

    return StatusResponse(
        status="success",
        message="Query received (placeholder - Gemini integration coming soon)",
        timestamp=timestamp
    )


@app.post("/handoff", response_model=StatusResponse)
async def generate_handoff(request: HandoffRequest):
    """
    Generate a handoff document for the project.
    Placeholder for future Gemini integration.
    """
    print(f"📋 POST /handoff - Recipient: {request.recipient or 'team'}")

    timestamp = datetime.now().isoformat()

    return StatusResponse(
        status="success",
        message="Handoff generation requested (placeholder - Gemini integration coming soon)",
        timestamp=timestamp
    )


@app.post("/mcp/log_decision", response_model=StatusResponse)
async def mcp_log_decision(decision: MCPLogDecision):
    """
    MCP endpoint to log a decision to the devlog.
    Allows AI tools to log architectural decisions and important choices.
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


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "devlog_exists": DEVLOG_PATH.exists()
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
