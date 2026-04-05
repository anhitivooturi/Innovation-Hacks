"""
DevLog AI - Gemini Agent
Uses Gemini 2.5 Flash via Vertex AI with google.genai SDK.
Falls back to local summarization when GCP is not configured.
"""

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Optional
from datetime import datetime


# Try to import Google GenAI SDK
GEMINI_AVAILABLE = False
genai_client = None

try:
    import google.genai as genai

    # Initialize Vertex AI client (NO API keys)
    genai_client = genai.Client(
        vertexai=True,
        project="devlog-vibhor-gemini",
        location="us-central1"
    )

    GEMINI_AVAILABLE = True
    print("✅ Gemini 2.5 Flash initialized via Vertex AI")
    print("📍 Project: devlog-vibhor-gemini")
    print("📍 Location: us-central1")

except ImportError as e:
    print("⚠️  google-genai package not installed - Gemini features disabled")
    print("   To enable: pip install google-genai")

except Exception as e:
    print(f"⚠️  Failed to initialize Gemini: {e}")
    print("📝 Gemini features disabled")


# Constants
GEMINI_TIMEOUT = 30  # seconds
MODEL_NAME = "gemini-2.5-flash"


# ============================================================================
# Core Gemini Function
# ============================================================================

def ask_gemini(prompt: str) -> str:
    """
    Send a prompt to Gemini and get a response.

    Args:
        prompt: The prompt to send

    Returns:
        Gemini's response text
    """
    if not GEMINI_AVAILABLE:
        raise Exception("Gemini is not available")

    response = genai_client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt
    )

    return response.text


# ============================================================================
# Local Fallback Functions
# ============================================================================

def local_process_change(filepath: str, diff: str, current_devlog: str) -> str:
    """
    Local fallback: smart summarization without Gemini.
    Detects change type and appends to devlog.
    """
    print(f"📝 Local processing (no Gemini): {filepath}")

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Analyze diff to determine change type
    lines = diff.split('\n')
    added_lines = [l for l in lines if l.startswith('+') and not l.startswith('+++')]
    removed_lines = [l for l in lines if l.startswith('-') and not l.startswith('---')]

    added_count = len(added_lines)
    removed_count = len(removed_lines)

    # Classify change
    if removed_count == 0 and added_count > 0:
        change_type = "feature"
        summary = f"Added {added_count} new lines to {filepath}"
    elif added_count == 0 and removed_count > 0:
        change_type = "cleanup/removal"
        summary = f"Removed {removed_count} lines from {filepath}"
    elif removed_count > added_count:
        change_type = "refactor/fix"
        summary = f"Refactored {filepath} (removed {removed_count}, added {added_count} lines)"
    else:
        change_type = "modification"
        summary = f"Modified {filepath} (added {added_count}, removed {removed_count} lines)"

    # Detect potential danger zones
    danger_keywords = ['auth', 'password', 'token', 'security', 'database', 'schema', 'migration', 'api']
    is_danger = any(keyword in filepath.lower() or keyword in diff.lower() for keyword in danger_keywords)
    danger_note = "\n⚠️  **Potential danger zone detected**" if is_danger else ""

    # Build entry
    entry = f"""
**{timestamp}** — {change_type.upper()}: `{filepath}`
{summary}{danger_note}

"""

    # Append to current devlog
    updated_devlog = current_devlog + entry

    print(f"✅ Local processing complete: {filepath}")
    return updated_devlog


def local_answer_query(question: str, devlog_content: str) -> str:
    """
    Local fallback: keyword search in devlog.
    """
    print(f"📝 Local query (no Gemini): {question[:50]}...")

    # Simple keyword extraction
    keywords = [word.lower().strip('?.,!') for word in question.split() if len(word) > 3]

    # Search for matching sections
    lines = devlog_content.split('\n')
    matches = []

    for i, line in enumerate(lines):
        line_lower = line.lower()
        if any(keyword in line_lower for keyword in keywords):
            # Get context (5 lines before and after)
            start = max(0, i - 5)
            end = min(len(lines), i + 6)
            context = '\n'.join(lines[start:end])
            matches.append(context)
            if len(matches) >= 3:  # Limit to 3 matches
                break

    if matches:
        answer = "Based on the devlog, here are relevant sections:\n\n" + "\n\n---\n\n".join(matches[:2])
    else:
        answer = "I couldn't find specific information about that in the devlog. The devlog may not have entries related to your question yet."

    print(f"✅ Local query complete")
    return answer


def local_generate_handoff(devlog_content: str) -> str:
    """
    Local fallback: return last 500 chars as handoff.
    """
    print(f"📝 Local handoff (no Gemini)")

    lines = devlog_content.split('\n')

    # Extract key sections
    recent_changes = []
    for i, line in enumerate(lines):
        if '## Recent Changes' in line:
            # Get next 20 lines
            recent_changes = lines[i:i+20]
            break

    handoff = f"""# Handoff Document
Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Recent Activity
{"".join(recent_changes) if recent_changes else "No recent changes recorded yet."}

## Full DevLog
For complete context, review devlog/project.md

---
*Note: This is a local fallback. Enable Gemini for AI-powered handoffs.*
"""

    print(f"✅ Local handoff complete")
    return handoff


# ============================================================================
# Main Functions (with Gemini + Fallback)
# ============================================================================

def process_change(filepath: str, diff: str, current_devlog: str) -> str:
    """
    Process a file change using Gemini to update the devlog intelligently.
    Falls back to local processing if Gemini is unavailable.

    Args:
        filepath: Path to the changed file
        diff: The diff of the change
        current_devlog: Current devlog markdown content

    Returns:
        Updated devlog markdown content
    """
    # Use local fallback if Gemini not available
    if not GEMINI_AVAILABLE:
        return local_process_change(filepath, diff, current_devlog)

    def call_gemini():
        """Internal function to call Gemini (for timeout wrapper)"""
        prompt = f"""You are DevLog AI, maintaining a living development log for Innovation Hacks 2026.

A file changed:
**File:** {filepath}
**Diff:**
```diff
{diff}
```

**Current DevLog:**
```markdown
{current_devlog}
```

**Your task:**

1. **Classify the change:**
   - Type: feature / fix / breaking / revert / config / refactor

2. **Write a summary:**
   - 2-3 sentences in plain English
   - What changed and why it matters
   - Potential impact on the project

3. **Detect danger zones:**
   - Does this touch auth, database schemas, API contracts, or security code?
   - If yes, add to "Danger Zones" section

4. **Update "What Needs To Be Built":**
   - Based on this change, what's next?
   - What dependencies or related work does this create?
   - Check off completed items if relevant

5. **Update "Current Working State":**
   - What's the project state after this change?
   - Update Backend/Frontend/Extension status

**Return the COMPLETE updated DevLog markdown** with:
- New entry under "Recent Changes"
- Updated "What Needs To Be Built"
- Updated "Current Working State"
- Updated "Danger Zones" if needed
- All existing content preserved

Format as clean markdown ready to write directly to the file.
"""

        return ask_gemini(prompt)

    try:
        # Execute with timeout
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(call_gemini)
            updated_devlog = future.result(timeout=GEMINI_TIMEOUT)

        print(f"✅ Gemini processed change: {filepath}")
        return updated_devlog

    except FuturesTimeoutError:
        print(f"⏱️  Gemini timeout after {GEMINI_TIMEOUT}s - using local fallback")
        return local_process_change(filepath, diff, current_devlog)

    except Exception as e:
        print(f"❌ Gemini processing failed: {e} - using local fallback")
        return local_process_change(filepath, diff, current_devlog)


def answer_query(question: str, devlog_content: str) -> str:
    """
    Answer a question about the project using the devlog as context.
    Falls back to keyword search if Gemini is unavailable.

    Args:
        question: User's question
        devlog_content: Full devlog markdown content

    Returns:
        Plain English answer
    """
    # Use local fallback if Gemini not available
    if not GEMINI_AVAILABLE:
        return local_answer_query(question, devlog_content)

    def call_gemini():
        """Internal function to call Gemini (for timeout wrapper)"""
        prompt = f"""You are DevLog AI, an assistant for Innovation Hacks 2026.

**DevLog:**
```markdown
{devlog_content}
```

**User Question:**
{question}

**Instructions:**
1. Answer based ONLY on the devlog content
2. If info isn't in the devlog, say so clearly
3. Cite specific entries or timestamps when relevant
4. Be concise but complete (2-4 sentences)
5. If the question implies next steps, suggest them

Provide a helpful, accurate answer in plain English.
"""

        return ask_gemini(prompt)

    try:
        # Execute with timeout
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(call_gemini)
            answer = future.result(timeout=GEMINI_TIMEOUT)

        print(f"✅ Gemini answered query: {question[:50]}...")
        return answer

    except FuturesTimeoutError:
        print(f"⏱️  Query timeout after {GEMINI_TIMEOUT}s - using local fallback")
        return local_answer_query(question, devlog_content)

    except Exception as e:
        print(f"❌ Query failed: {e} - using local fallback")
        return local_answer_query(question, devlog_content)


def generate_handoff(devlog_content: str) -> str:
    """
    Generate a session handoff document from the devlog.
    Falls back to simple summary if Gemini is unavailable.

    Args:
        devlog_content: Full devlog markdown content

    Returns:
        Handoff document as markdown
    """
    # Use local fallback if Gemini not available
    if not GEMINI_AVAILABLE:
        return local_generate_handoff(devlog_content)

    def call_gemini():
        """Internal function to call Gemini (for timeout wrapper)"""
        prompt = f"""You are DevLog AI. Generate a session handoff brief for Innovation Hacks 2026.

**DevLog:**
```markdown
{devlog_content}
```

**Create a handoff document with:**

1. **What Was Done** (3-4 bullet points)
   - Key accomplishments this session
   - Files modified

2. **Current State**
   - What's working
   - What's in progress
   - What's blocked

3. **Next Steps** (prioritized)
   - Most important tasks to tackle next
   - Dependencies to resolve

4. **Danger Zones**
   - Known issues or risky areas
   - Technical debt

5. **How to Continue**
   - Commands to run
   - Files to check
   - Context needed

Format as clean, scannable markdown. Keep it under 300 words.
"""

        return ask_gemini(prompt)

    try:
        # Execute with timeout
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(call_gemini)
            handoff_doc = future.result(timeout=GEMINI_TIMEOUT)

        print(f"✅ Gemini generated handoff ({len(handoff_doc)} chars)")
        return handoff_doc

    except FuturesTimeoutError:
        print(f"⏱️  Handoff timeout after {GEMINI_TIMEOUT}s - using local fallback")
        return local_generate_handoff(devlog_content)

    except Exception as e:
        print(f"❌ Handoff generation failed: {e} - using local fallback")
        return local_generate_handoff(devlog_content)


# ============================================================================
# Testing
# ============================================================================

if __name__ == "__main__":
    print("\n🧪 Testing Gemini Agent...\n")

    if GEMINI_AVAILABLE:
        print("✅ Gemini is available and ready!")
        print(f"📍 Model: {MODEL_NAME}\n")

        # Test simple query
        try:
            test_answer = answer_query(
                "What is this project about?",
                "# DevLog AI — Innovation Hacks 2026\nBuilding an AI agent that watches code changes."
            )
            print(f"Test Query Response:\n{test_answer}\n")
        except Exception as e:
            print(f"Test failed: {e}")

    else:
        print("❌ Gemini is NOT available")
        print("📝 Using local fallback mode\n")

        # Test local fallback
        test_devlog = "# DevLog AI\n\n## Recent Changes\nNone yet"
        test_diff = "+print('hello world')\n+def main():\n+    pass"

        result = local_process_change("test.py", test_diff, test_devlog)
        print("Local processing test:")
        print(result[:200])

        print("\n\nTo enable Gemini:")
        print("1. Install: pip install google-genai")
        print("2. Authenticate: gcloud auth application-default login")
        print("3. Restart the API server")
