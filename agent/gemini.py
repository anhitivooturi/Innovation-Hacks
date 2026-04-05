"""
DevLog AI - Gemini Agent
Uses Gemini 2.5 Flash via Vertex AI with google.genai SDK.
Falls back to local summarization when GCP is not configured.
"""

import os
import json
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Optional, Dict
from datetime import datetime


# Try to import Google GenAI SDK
GEMINI_AVAILABLE = False
genai_client = None

try:
    import google.genai as genai

    # Initialize Vertex AI client (NO API keys)
    genai_client = genai.Client(
        vertexai=True,
        project="project-5f6bf043-2561-48a7-af4",
        location="us-central1"
    )

    GEMINI_AVAILABLE = True
    print("✅ Gemini 2.5 Flash initialized via Vertex AI")
    print("📍 Project: project-5f6bf043-2561-48a7-af4")
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
# Structured Analysis for /change endpoint
# ============================================================================

def analyze_change_with_gemini(file_path: str, content: str, diff: str) -> Dict:
    """
    Analyze a code change and return structured JSON with specific, actionable insights.

    Args:
        file_path: Path to the changed file
        content: Full file content
        diff: The diff of the change

    Returns:
        Dict with structured analysis or fallback data
    """
    if not GEMINI_AVAILABLE:
        return _fallback_analysis(file_path, diff)

    # Build a strong, specific prompt for high-quality output
    prompt = f"""You are DevLog AI, a code change analyzer.

Your job: Analyze this diff and output a CONCISE, SPECIFIC summary.

RULES:
- Mention the EXACT filename and what was done (e.g., "added function X", "fixed bug in Y")
- Classify the change type accurately
- Keep summary to 1-2 sentences MAX
- NO generic phrases like "modified code" or "updated file"
- NO repeating the diff verbatim
- Focus on WHAT changed and WHY it matters

File: {file_path}

Diff:
{diff[:1500]}

{"Context (first 1000 chars):" if content else ""}
{content[:1000] if content else ""}

OUTPUT FORMAT (strict JSON, no markdown):
{{
  "summary": "Specific 1-2 sentence summary mentioning filename and exact change",
  "classification": "feature | fix | refactor | breaking | config",
  "danger": true/false,
  "reason": "Brief explanation of impact or safety",
  "todos": ["specific action items if needed"],
  "affected_files": ["{file_path}"]
}}

Example good summary:
"Added new authentication middleware in auth.py that validates JWT tokens on protected routes."

Example bad summary:
"Modified the code in auth.py to update functionality."

RESPOND WITH JSON ONLY:"""

    try:
        # Call Gemini with timeout
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(ask_gemini, prompt)
            response_text = future.result(timeout=GEMINI_TIMEOUT)

        # Clean and parse response
        result = _parse_gemini_response(response_text, file_path)

        # Validate quality (no generic summaries)
        if _is_generic_summary(result['summary']):
            print(f"⚠️  Generic summary detected, enhancing with fallback")
            fallback = _smart_fallback_analysis(file_path, diff)
            result['summary'] = fallback['summary']

        print(f"✅ Gemini analyzed: {file_path}")
        return result

    except (FuturesTimeoutError, json.JSONDecodeError, Exception) as e:
        print(f"⚠️  Gemini analysis failed: {e}, using smart fallback")
        return _smart_fallback_analysis(file_path, diff)


def _parse_gemini_response(response_text: str, file_path: str) -> Dict:
    """
    Parse Gemini's JSON response, handling markdown code blocks.
    """
    response_text = response_text.strip()

    # Remove markdown code blocks if present
    if '```' in response_text:
        # Extract content between first ``` and last ```
        parts = response_text.split('```')
        for part in parts:
            part = part.strip()
            if part.startswith('json'):
                part = part[4:].strip()
            if part.startswith('{'):
                response_text = part
                break

    # Parse JSON
    result = json.loads(response_text)

    # Ensure required fields exist
    if 'summary' not in result:
        result['summary'] = f"Modified {file_path}"
    if 'classification' not in result:
        result['classification'] = 'modification'
    if 'danger' not in result:
        result['danger'] = False
    if 'reason' not in result:
        result['reason'] = 'Standard change'
    if 'todos' not in result:
        result['todos'] = []
    if 'affected_files' not in result:
        result['affected_files'] = [file_path]

    return result


def _is_generic_summary(summary: str) -> bool:
    """
    Check if summary is too generic and unhelpful.
    """
    generic_phrases = [
        'modified code',
        'updated file',
        'changed the',
        'modified the file',
        'updated the code',
        'made changes',
        'code was modified',
        'file was updated',
    ]

    summary_lower = summary.lower()
    return any(phrase in summary_lower for phrase in generic_phrases)


def _smart_fallback_analysis(file_path: str, diff: str) -> Dict:
    """
    Intelligent fallback that actually parses the diff to understand changes.
    Better than just counting lines.
    """
    lines = diff.split('\n')
    added_lines = [l[1:].strip() for l in lines if l.startswith('+') and not l.startswith('+++')]
    removed_lines = [l[1:].strip() for l in lines if l.startswith('-') and not l.startswith('---')]

    added_count = len(added_lines)
    removed_count = len(removed_lines)

    # Try to detect what kind of change this is
    classification = 'modification'
    summary = f"Modified {file_path}"
    danger = False
    reason = "Standard modification"

    # Detect new functions/classes/imports
    if any('def ' in l or 'class ' in l for l in added_lines):
        classification = 'feature'
        if any('def ' in l for l in added_lines):
            func_names = [l.split('def ')[1].split('(')[0] for l in added_lines if 'def ' in l]
            if func_names:
                summary = f"Added new function `{func_names[0]}()` in {file_path}"
        elif any('class ' in l for l in added_lines):
            class_names = [l.split('class ')[1].split('(')[0].split(':')[0] for l in added_lines if 'class ' in l]
            if class_names:
                summary = f"Added new class `{class_names[0]}` in {file_path}"

    # Detect fixes (comments or error handling)
    elif any('fix' in l.lower() or 'bug' in l.lower() for l in added_lines):
        classification = 'fix'
        summary = f"Applied bug fix in {file_path}"

    # Detect config changes
    elif file_path.endswith(('.json', '.yaml', '.yml', '.toml', '.env', '.config')):
        classification = 'config'
        summary = f"Updated configuration in {file_path}"

    # Detect breaking changes
    elif any('def ' in l or 'class ' in l for l in removed_lines):
        classification = 'breaking'
        danger = True
        summary = f"Removed function or class from {file_path} (potentially breaking)"
        reason = "Deletion of code structure may break dependent code"

    # Default: just describe the diff
    else:
        if added_count > removed_count:
            summary = f"Added {added_count} lines to {file_path}"
        elif removed_count > added_count:
            summary = f"Removed {removed_count} lines from {file_path}"
        else:
            summary = f"Modified {added_count} lines in {file_path}"

    return {
        "summary": summary,
        "classification": classification,
        "danger": danger,
        "reason": reason,
        "todos": [],
        "affected_files": [file_path]
    }


def _fallback_analysis(file_path: str, diff: str) -> Dict:
    """
    Basic fallback when Gemini is not available.
    Uses smart fallback internally.
    """
    result = _smart_fallback_analysis(file_path, diff)
    result['reason'] = "Gemini unavailable - using local analysis"
    return result


# ============================================================================
# Query Interface for /query endpoint
# ============================================================================

def answer_query(question: str, devlog_content: str) -> str:
    """
    Answer a question about the project using devlog context.
    Returns concise, specific answers - NOT full log dumps.

    Args:
        question: User's question
        devlog_content: Full devlog content

    Returns:
        Plain English answer (concise, specific)
    """
    if not GEMINI_AVAILABLE:
        return _fallback_query_answer(question, devlog_content)

    # Extract only relevant sections to keep context focused
    relevant_context = _extract_relevant_context(question, devlog_content)

    prompt = f"""You are DevLog AI, a project assistant that provides CONCISE, SPECIFIC answers.

RULES:
- Answer the question DIRECTLY
- Be specific: mention filenames, function names, exact changes
- Keep response to 2-3 sentences MAX
- NO repeating entire logs or diffs
- NO generic responses like "the project was updated"

Question: {question}

Project Context:
{relevant_context}

Provide a direct, specific answer:"""

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(ask_gemini, prompt)
            answer = future.result(timeout=GEMINI_TIMEOUT)

        # Validate answer quality
        if len(answer) > 500:  # Too long, likely dumping logs
            print("⚠️  Response too long, using fallback")
            return _fallback_query_answer(question, devlog_content)

        print(f"✅ Gemini answered query: {question[:50]}")
        return answer.strip()

    except Exception as e:
        print(f"⚠️  Query failed: {e}")
        return _fallback_query_answer(question, devlog_content)


def _extract_relevant_context(question: str, devlog_content: str, max_chars: int = 3000) -> str:
    """
    Extract only relevant sections from devlog based on question.
    Prevents dumping full logs into context.
    """
    keywords = [w.lower().strip('?.,!') for w in question.split() if len(w) > 3]
    lines = devlog_content.split('\n')
    relevant_lines = []

    # Find lines matching keywords
    for i, line in enumerate(lines):
        if any(k in line.lower() for k in keywords):
            # Include surrounding context (5 lines before/after)
            start = max(0, i - 5)
            end = min(len(lines), i + 6)
            chunk = '\n'.join(lines[start:end])
            if chunk not in relevant_lines:
                relevant_lines.append(chunk)

    # If nothing found, return recent activity
    if not relevant_lines:
        return '\n'.join(lines[-50:])  # Last 50 lines

    # Join and truncate
    result = '\n\n---\n\n'.join(relevant_lines)
    return result[:max_chars]


def _fallback_query_answer(question: str, devlog_content: str) -> str:
    """
    Fallback query answering using keyword search.
    """
    keywords = [w.lower().strip('?.,!') for w in question.split() if len(w) > 3]
    lines = devlog_content.split('\n')
    matches = []

    for i, line in enumerate(lines):
        if any(k in line.lower() for k in keywords):
            start = max(0, i - 2)
            end = min(len(lines), i + 3)
            matches.append('\n'.join(lines[start:end]))
            if len(matches) >= 2:
                break

    if matches:
        return "Based on the devlog:\n\n" + "\n\n".join(matches[:2])
    else:
        return "I couldn't find specific information about that in the devlog."


# ============================================================================
# Handoff Generation for /handoff endpoint
# ============================================================================

def generate_handoff(devlog_content: str) -> str:
    """
    Generate an intelligent project handoff document.
    Returns clean, concise markdown - NOT raw log dumps.

    Args:
        devlog_content: Full devlog content

    Returns:
        Formatted markdown handoff document
    """
    if not GEMINI_AVAILABLE:
        return _fallback_handoff(devlog_content)

    prompt = f"""You are DevLog AI, generating a CONCISE project handoff document.

RULES:
- Be SPECIFIC: mention actual components, files, features built
- Keep it CONCISE: 3-5 bullet points per section
- NO dumping raw logs or repeating full devlog
- Focus on ACTIONABLE information for next developer

Structure:
## What Was Built
- Specific features/components added (mention files/functions)

## Current System State
- What's working, what's integrated

## Recent Changes (Last 3-5)
- Specific changes with filenames

## Open Todos
- Actionable next steps

## Risks / Warnings
- Any danger zones or issues to watch

Project Context:
{devlog_content[:6000]}

Generate clean markdown handoff:"""

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(ask_gemini, prompt)
            handoff = future.result(timeout=GEMINI_TIMEOUT)

        # Add header with timestamp
        header = f"""# DevLog Handoff
Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

---

"""
        print(f"✅ Gemini generated handoff")
        return header + handoff.strip()

    except Exception as e:
        print(f"⚠️  Handoff generation failed: {e}")
        return _fallback_handoff(devlog_content)


def _fallback_handoff(devlog_content: str) -> str:
    """
    Fallback handoff generation when Gemini is unavailable.
    """
    lines = devlog_content.split('\n')
    recent = '\n'.join(lines[-30:]) if len(lines) > 30 else devlog_content

    return f"""# DevLog Handoff
Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Status
⚠️  Gemini unavailable - using basic summary

## Recent Activity
{recent}

## Next Steps
- Review full devlog at devlog/project.md
- Verify system integrations
- Run tests

---
*For detailed context, review the complete devlog file*
"""


# ============================================================================
# Legacy function for backward compatibility
# ============================================================================

def process_change(filepath: str, diff: str, current_devlog: str) -> str:
    """
    Legacy function - returns enriched devlog.
    For new code, use analyze_change_with_gemini() instead.
    """
    # This is kept for backward compatibility but not used in main flow
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    analysis = analyze_change_with_gemini(filepath, "", diff)

    entry = f"""
**{timestamp}** — {analysis['classification'].upper()}: `{filepath}`
{analysis['summary']}
{f"⚠️  DANGER: {analysis['reason']}" if analysis['danger'] else ""}

"""

    return current_devlog + entry


# ============================================================================
# Testing
# ============================================================================

if __name__ == "__main__":
    print("\n🧪 Testing Gemini Agent...\n")

    if GEMINI_AVAILABLE:
        print("✅ Gemini is available and ready!")
        print(f"📍 Model: {MODEL_NAME}\n")

        # Test query
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
        print("To enable Gemini:")
        print("1. Install: pip install google-genai")
        print("2. Authenticate: gcloud auth application-default login")
        print("3. Restart the API server")
