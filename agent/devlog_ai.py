"""
DevLog AI - Intelligence Layer
Analyzes code changes using Gemini and provides insights.
"""

from agent.gemini import ask_gemini


def analyze_code_change(file_path: str, content: str) -> str:
    """
    Analyze a code change and provide intelligent insights.

    Args:
        file_path: Path to the changed file
        content: Content of the changed file

    Returns:
        AI-generated analysis of the change
    """
    prompt = f"""
You are DevLog AI.

A file was modified.

File path: {file_path}

File content:
{content}

Perform:
1. Summarize what changed
2. Explain purpose of code
3. Detect possible bugs or issues
4. Suggest improvements

Keep response concise but useful.
"""

    return ask_gemini(prompt)
