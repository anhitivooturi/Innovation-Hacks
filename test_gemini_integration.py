#!/usr/bin/env python3
"""
Test script to verify Gemini integration in DevLog AI
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent))

from agent.gemini import ask_gemini, analyze_change_with_gemini, answer_query, generate_handoff, GEMINI_AVAILABLE


def test_ask_gemini():
    """Test basic ask_gemini function"""
    print("\n=== Testing ask_gemini() ===")

    if not GEMINI_AVAILABLE:
        print("❌ Gemini not available - skipping test")
        return False

    try:
        response = ask_gemini("What is 2+2? Answer with just the number.")
        print(f"✅ Basic query works: {response.strip()}")
        return True
    except Exception as e:
        print(f"❌ ask_gemini failed: {e}")
        return False


def test_analyze_change():
    """Test structured change analysis"""
    print("\n=== Testing analyze_change_with_gemini() ===")

    test_diff = """--- old/test.py
+++ new/test.py
@@ -1,3 +1,5 @@
 def hello():
-    print("hi")
+    print("hello world")
+    logger.info("User authenticated")
+    return True
"""

    test_content = """def hello():
    print("hello world")
    logger.info("User authenticated")
    return True
"""

    try:
        result = analyze_change_with_gemini("test.py", test_content, test_diff)
        print(f"✅ Analysis returned:")
        print(f"   Summary: {result.get('summary', 'N/A')}")
        print(f"   Classification: {result.get('classification', 'N/A')}")
        print(f"   Danger: {result.get('danger', 'N/A')}")
        print(f"   Reason: {result.get('reason', 'N/A')}")
        return True
    except Exception as e:
        print(f"❌ analyze_change_with_gemini failed: {e}")
        return False


def test_query():
    """Test query answering"""
    print("\n=== Testing answer_query() ===")

    test_devlog = """# DevLog AI
## Recent Changes
- Added authentication
- Fixed database connection
- Updated API endpoints
"""

    try:
        answer = answer_query("What authentication changes were made?", test_devlog)
        print(f"✅ Query answered:")
        print(f"   {answer[:150]}...")
        return True
    except Exception as e:
        print(f"❌ answer_query failed: {e}")
        return False


def test_handoff():
    """Test handoff generation"""
    print("\n=== Testing generate_handoff() ===")

    test_devlog = """# DevLog AI
## Recent Changes
- Built file watcher
- Integrated Gemini
- Created FastAPI endpoints
"""

    try:
        handoff = generate_handoff(test_devlog)
        print(f"✅ Handoff generated:")
        print(f"   {handoff[:150]}...")
        return True
    except Exception as e:
        print(f"❌ generate_handoff failed: {e}")
        return False


def main():
    """Run all tests"""
    print("🧪 Testing Gemini Integration for DevLog AI\n")

    if not GEMINI_AVAILABLE:
        print("⚠️  Gemini is not available!")
        print("Tests will use fallback logic.\n")

    results = []
    results.append(("ask_gemini", test_ask_gemini()))
    results.append(("analyze_change", test_analyze_change()))
    results.append(("answer_query", test_query()))
    results.append(("generate_handoff", test_handoff()))

    print("\n" + "="*50)
    print("RESULTS:")
    print("="*50)

    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")

    passed_count = sum(1 for _, p in results if p)
    total_count = len(results)

    print(f"\nTotal: {passed_count}/{total_count} tests passed")

    if passed_count == total_count:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
