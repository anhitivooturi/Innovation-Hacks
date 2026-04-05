"""
DevLog AI - Gemini Agent
Uses Gemini 1.5 Pro via Vertex AI to process changes and generate insights.
"""

import os
from typing import Optional
from dotenv import load_dotenv

import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig


# Load environment variables from .env
load_dotenv()

# Environment variables
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID")
GCP_LOCATION = os.getenv("GCP_LOCATION", "us-central1")

# Initialize Vertex AI
GEMINI_AVAILABLE = False
try:
    if not GCP_PROJECT_ID:
        print("⚠️  GCP_PROJECT_ID not set in .env - Gemini features disabled")
    else:
        vertexai.init(project=GCP_PROJECT_ID, location=GCP_LOCATION)
        MODEL_NAME = "gemini-1.5-pro"
        GEMINI_AVAILABLE = True
        print(f"✅ Vertex AI initialized: {GCP_PROJECT_ID} / {GCP_LOCATION}")
except Exception as e:
    print(f"⚠️  Failed to initialize Vertex AI: {e}")
    print("📝 Gemini features disabled. Set GCP_PROJECT_ID in .env")


def process_change(filepath: str, diff: str, current_devlog: str) -> str:
    """
    Process a file change using Gemini to update the devlog intelligently.

    Args:
        filepath: Path to the changed file
        diff: The diff of the change
        current_devlog: Current devlog markdown content

    Returns:
        Updated devlog markdown content (or original if Gemini fails)
    """
    if not GEMINI_AVAILABLE:
        print("⚠️  Gemini unavailable - returning original devlog")
        return current_devlog

    try:
        # Create the prompt
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

        # Call Gemini
        model = GenerativeModel(MODEL_NAME)
        config = GenerationConfig(
            temperature=0.3,  # Lower temperature for consistency
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
        return current_devlog


def answer_query(question: str, devlog_content: str) -> str:
    """
    Answer a question about the project using the devlog as context.

    Args:
        question: User's question
        devlog_content: Full devlog markdown content

    Returns:
        Plain English answer
    """
    if not GEMINI_AVAILABLE:
        return "Gemini is not available. Set GCP_PROJECT_ID in .env to enable AI-powered queries."

    try:
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
        print(f"❌ Query failed: {e}")
        return f"Error answering question: {str(e)}\n\nCheck your GCP credentials and Vertex AI setup."


def generate_handoff(devlog_content: str) -> str:
    """
    Generate a session handoff document from the devlog.

    Args:
        devlog_content: Full devlog markdown content

    Returns:
        Handoff document as markdown
    """
    if not GEMINI_AVAILABLE:
        return "# Handoff Document\n\nGemini is not available. Set GCP_PROJECT_ID in .env to generate AI-powered handoffs."

    try:
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

        model = GenerativeModel(MODEL_NAME)
        config = GenerationConfig(
            temperature=0.4,
            max_output_tokens=4096,
        )

        response = model.generate_content(
            prompt,
            generation_config=config
        )

        handoff_doc = response.text.strip()

        print(f"✅ Gemini generated handoff ({len(handoff_doc)} chars)")
        return handoff_doc

    except Exception as e:
        print(f"❌ Handoff generation failed: {e}")
        return f"""# Handoff Document

**Error:** Could not generate handoff using Gemini.

**Error Details:** {str(e)}

Please check your GCP credentials and Vertex AI API access.

**Manual Handoff:**
Review devlog/project.md for complete project history.
"""


# ============================================================================
# Testing
# ============================================================================

if __name__ == "__main__":
    print("\n🧪 Testing Gemini Agent...\n")

    if GEMINI_AVAILABLE:
        print("✅ Gemini is available and ready!")
        print(f"📍 Project: {GCP_PROJECT_ID}")
        print(f"📍 Location: {GCP_LOCATION}")
        print(f"📍 Model: gemini-1.5-pro\n")

        # Test simple query
        test_answer = answer_query(
            "What is this project about?",
            "# DevLog AI — Innovation Hacks 2026\nBuilding an AI agent that watches code changes."
        )
        print(f"Test Query Response:\n{test_answer}\n")

    else:
        print("❌ Gemini is NOT available")
        print("\nTo enable Gemini:")
        print("1. Create .env file in project root")
        print("2. Add: GCP_PROJECT_ID=your-project-id")
        print("3. Add: GCP_LOCATION=us-central1")
        print("4. Run: gcloud auth application-default login")
        print("5. Restart the API server")
