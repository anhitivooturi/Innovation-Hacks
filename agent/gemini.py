"""
DevLog AI - Gemini Agent
Uses Gemini 1.5 Pro via Vertex AI to process changes and generate insights.
"""

import os
from typing import Optional

from google.cloud import aiplatform
from vertexai.generative_models import GenerativeModel, GenerationConfig


# Environment variables
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "your-project-id")
GCP_LOCATION = os.getenv("GCP_LOCATION", "us-central1")

# Initialize Vertex AI
try:
    aiplatform.init(project=GCP_PROJECT_ID, location=GCP_LOCATION)
    MODEL_NAME = "gemini-1.5-pro"
    print(f"✅ Vertex AI initialized: {GCP_PROJECT_ID} / {GCP_LOCATION}")
except Exception as e:
    print(f"⚠️  Warning: Failed to initialize Vertex AI: {e}")
    print("📝 Gemini features will be disabled. Set GCP_PROJECT_ID and GCP_LOCATION environment variables.")


def process_change(filepath: str, diff: str, current_devlog: str) -> str:
    """
    Process a file change using Gemini to update the devlog intelligently.

    Args:
        filepath: Path to the changed file
        diff: The diff of the change
        current_devlog: Current devlog markdown content

    Returns:
        Updated devlog markdown content
    """
    try:
        # Create the prompt
        prompt = f"""You are DevLog AI, an intelligent agent that maintains a living development log for a software project.

A file has been changed:
- **File:** {filepath}
- **Diff:**
```diff
{diff}
```

**Current DevLog:**
```markdown
{current_devlog}
```

**Your task:**
1. **Classify the change:** Is this a new feature, bug fix, breaking change, revert, config change, or refactor?

2. **Write a summary:** Provide a 2-3 sentence plain English explanation of:
   - What changed
   - Why it matters
   - Any potential impact on other parts of the project

3. **Detect danger zones:** Does this change touch:
   - Authentication/authorization code
   - Database schemas or migrations
   - API contracts or breaking changes
   - Security-sensitive code
   If yes, flag it clearly.

4. **Update "What Needs To Be Built" section:** Based on this change, what's next? What dependencies or related work does this create?

5. **Update "Current Working State" section:** What's the current state of the project after this change?

**Return the complete updated DevLog markdown** with:
- A new timestamped entry for this change
- Updated "What Needs To Be Built" section
- Updated "Current Working State" section
- All existing content preserved

Format your response as clean markdown, ready to write to the devlog file.
"""

        # Call Gemini
        model = GenerativeModel(MODEL_NAME)
        config = GenerationConfig(
            temperature=0.3,  # Lower temperature for more focused output
            max_output_tokens=8192,
        )

        response = model.generate_content(
            prompt,
            generation_config=config
        )

        # Extract text from response
        updated_devlog = response.text.strip()

        print(f"✅ Gemini processed change: {filepath}")
        return updated_devlog

    except Exception as e:
        print(f"❌ Gemini processing failed: {e}")
        print("📝 Returning original devlog unchanged")

        # Return original devlog unchanged on error
        return current_devlog


def generate_handoff(devlog_content: str) -> str:
    """
    Generate a handoff document from the devlog.

    Args:
        devlog_content: Full devlog markdown content

    Returns:
        Handoff document as markdown
    """
    try:
        prompt = f"""You are DevLog AI. Generate a comprehensive handoff document from this development log.

**DevLog Content:**
```markdown
{devlog_content}
```

**Create a handoff document with:**

1. **Executive Summary** (3-4 sentences)
   - What was built
   - Current state
   - What's working vs what's pending

2. **Key Decisions Made**
   - List major architectural or technical decisions
   - Include rationale

3. **Current Architecture**
   - High-level system overview
   - Key components and their responsibilities

4. **What's Completed**
   - Functional features
   - Tested and verified work

5. **What's In Progress**
   - Partially completed work
   - Known blockers

6. **What Needs To Be Built**
   - Prioritized list of remaining work
   - Estimated complexity (high/medium/low)

7. **Danger Zones / Technical Debt**
   - Security concerns
   - Performance issues
   - Code that needs refactoring

8. **How to Run / Test**
   - Setup instructions
   - Test procedures

9. **Resources & References**
   - Key files and their purposes
   - External dependencies
   - Documentation links

Format as clean, professional markdown suitable for a team handoff or README.
"""

        model = GenerativeModel(MODEL_NAME)
        config = GenerationConfig(
            temperature=0.4,
            max_output_tokens=8192,
        )

        response = model.generate_content(
            prompt,
            generation_config=config
        )

        handoff_doc = response.text.strip()

        print(f"✅ Gemini generated handoff document ({len(handoff_doc)} chars)")
        return handoff_doc

    except Exception as e:
        print(f"❌ Handoff generation failed: {e}")

        # Return a basic handoff on error
        return f"""# Project Handoff Document

**Error:** Could not generate handoff document using Gemini.

**DevLog Summary:**
The devlog contains {len(devlog_content.splitlines())} lines of development history.

Please review the devlog manually or retry with Gemini connectivity.

## Current DevLog
```
{devlog_content[:2000]}...
```
"""


def answer_query(question: str, devlog_content: str) -> str:
    """
    Answer a question about the project using the devlog as context.

    Args:
        question: User's question
        devlog_content: Full devlog markdown content

    Returns:
        Answer as text
    """
    try:
        prompt = f"""You are DevLog AI, an assistant that answers questions about a software project based on its development log.

**DevLog Content:**
```markdown
{devlog_content}
```

**User Question:**
{question}

**Instructions:**
1. Answer the question based ONLY on information in the devlog
2. If the information isn't in the devlog, say so clearly
3. Cite specific entries or timestamps when relevant
4. Be concise but complete
5. If the question implies next steps, suggest them based on the project's context

Provide a helpful, accurate answer.
"""

        model = GenerativeModel(MODEL_NAME)
        config = GenerationConfig(
            temperature=0.5,
            max_output_tokens=2048,
        )

        response = model.generate_content(
            prompt,
            generation_config=config
        )

        answer = response.text.strip()

        print(f"✅ Gemini answered query: {question[:50]}...")
        return answer

    except Exception as e:
        print(f"❌ Query answering failed: {e}")

        return f"""I'm unable to answer your question right now due to a Gemini API error: {str(e)}

**Your question:** {question}

Please check:
1. GCP_PROJECT_ID and GCP_LOCATION environment variables are set
2. Vertex AI API is enabled in your GCP project
3. Authentication is configured (gcloud auth application-default login)

You can also review the devlog manually for the information you need.
"""


# ============================================================================
# Utility Functions
# ============================================================================

def test_gemini_connection() -> bool:
    """
    Test if Gemini is accessible.

    Returns:
        True if connection successful, False otherwise
    """
    try:
        model = GenerativeModel(MODEL_NAME)
        response = model.generate_content(
            "Say 'DevLog AI is ready' if you can read this.",
            generation_config=GenerationConfig(max_output_tokens=100)
        )

        if response.text:
            print(f"✅ Gemini connection successful: {MODEL_NAME}")
            return True

    except Exception as e:
        print(f"❌ Gemini connection failed: {e}")
        return False

    return False


if __name__ == "__main__":
    print("\n🧪 Testing Gemini Agent...\n")

    # Test connection
    if test_gemini_connection():
        print("\n✅ Gemini agent is ready!")
    else:
        print("\n❌ Gemini agent failed to initialize.")
        print("Set up Vertex AI credentials and try again.")
