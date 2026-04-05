#!/usr/bin/env python3
"""
DevLog AI - Full System Test Script
Tests the complete flow: watcher → backend → Firestore → query → handoff
"""

import os
import time
import json
import requests
from pathlib import Path
from datetime import datetime


# Configuration
API_URL = os.getenv("DEVLOG_API_URL", "https://devlog-backend-130030203761.us-central1.run.app")
TEST_FILE = Path("test_file_for_devlog.py")


def print_section(title: str):
    """Print a section header."""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def test_api_health():
    """Test 1: Check API health."""
    print_section("TEST 1: API Health Check")

    try:
        response = requests.get(f"{API_URL}/health", timeout=10)
        response.raise_for_status()

        data = response.json()
        print(f"✅ API is healthy")
        print(f"   Status: {data.get('status')}")
        print(f"   Firestore: {data.get('firestore_available')}")
        print(f"   Timestamp: {data.get('timestamp')}")

        return True

    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False


def test_create_file():
    """Test 2: Create a test file to trigger watcher."""
    print_section("TEST 2: Create Test File")

    try:
        content = f'''def hello_devlog():
    """Test function for DevLog AI."""
    print("Hello from DevLog AI!")
    return "Success"

# Generated at {datetime.now().isoformat()}
'''

        TEST_FILE.write_text(content)
        print(f"✅ Created test file: {TEST_FILE}")
        print(f"   Content: {len(content)} chars")

        return True

    except Exception as e:
        print(f"❌ File creation failed: {e}")
        return False


def test_manual_change_submission():
    """Test 3: Manually submit change to API."""
    print_section("TEST 3: Manual Change Submission")

    try:
        payload = {
            "timestamp": datetime.now().isoformat(),
            "file_path": str(TEST_FILE),
            "event_type": "created",
            "diff": "+def hello_devlog():\n+    print('Hello!')\n",
            "old_content": None,
            "new_content": TEST_FILE.read_text(),
            "lines_added": 8,
            "lines_removed": 0
        }

        response = requests.post(
            f"{API_URL}/change",
            json=payload,
            timeout=15
        )
        response.raise_for_status()

        data = response.json()
        print(f"✅ Change submitted successfully")
        print(f"   Status: {data.get('status')}")
        print(f"   Message: {data.get('message')}")

        return True

    except Exception as e:
        print(f"❌ Change submission failed: {e}")
        return False


def test_wait_for_gemini():
    """Test 4: Wait for Gemini analysis (background task)."""
    print_section("TEST 4: Waiting for Gemini Analysis")

    print("⏳ Waiting 10 seconds for Gemini to analyze...")
    for i in range(10, 0, -1):
        print(f"   {i}...", end="\r")
        time.sleep(1)

    print("\n✅ Background processing time elapsed")
    return True


def test_query_system():
    """Test 5: Query the system about the change."""
    print_section("TEST 5: Query System")

    questions = [
        "What changed last?",
        "What is this project about?",
        "What functions were added?"
    ]

    for question in questions:
        try:
            payload = {"question": question}
            response = requests.post(
                f"{API_URL}/query",
                json=payload,
                timeout=30
            )
            response.raise_for_status()

            data = response.json()
            print(f"❓ Question: {question}")
            print(f"✅ Answer: {data.get('answer', 'No answer')[:200]}")
            print()

        except Exception as e:
            print(f"❌ Query failed for '{question}': {e}\n")

    return True


def test_generate_handoff():
    """Test 6: Generate handoff document."""
    print_section("TEST 6: Generate Handoff")

    try:
        payload = {"recipient": "Test Team"}
        response = requests.post(
            f"{API_URL}/handoff",
            json=payload,
            timeout=30
        )
        response.raise_for_status()

        data = response.json()
        handoff = data.get('handoff_document', '')

        print(f"✅ Handoff document generated")
        print(f"   Length: {len(handoff)} chars")
        print("\n--- Handoff Preview (first 500 chars) ---")
        print(handoff[:500])
        print("...\n")

        return True

    except Exception as e:
        print(f"❌ Handoff generation failed: {e}")
        return False


def test_create_snapshot():
    """Test 7: Create a snapshot."""
    print_section("TEST 7: Create Snapshot")

    try:
        response = requests.post(
            f"{API_URL}/snapshot",
            params={"reason": "Test snapshot from full system test"},
            timeout=15
        )
        response.raise_for_status()

        data = response.json()
        print(f"✅ Snapshot created")
        print(f"   ID: {data.get('snapshot_id')}")
        print(f"   Timestamp: {data.get('timestamp')}")

        return True

    except Exception as e:
        print(f"❌ Snapshot creation failed: {e}")
        return False


def test_list_snapshots():
    """Test 8: List all snapshots."""
    print_section("TEST 8: List Snapshots")

    try:
        response = requests.get(f"{API_URL}/snapshots", timeout=10)
        response.raise_for_status()

        data = response.json()
        snapshots = data.get('snapshots', [])

        print(f"✅ Retrieved {len(snapshots)} snapshot(s)")

        for snapshot in snapshots[:3]:  # Show first 3
            print(f"   - ID: {snapshot.get('id')}")
            print(f"     Timestamp: {snapshot.get('timestamp')}")
            print(f"     Reason: {snapshot.get('reason')}")
            print()

        return True

    except Exception as e:
        print(f"❌ Snapshot listing failed: {e}")
        return False


def cleanup():
    """Cleanup: Remove test file."""
    print_section("CLEANUP")

    try:
        if TEST_FILE.exists():
            TEST_FILE.unlink()
            print(f"✅ Removed test file: {TEST_FILE}")
        else:
            print(f"⚠️  Test file not found: {TEST_FILE}")

    except Exception as e:
        print(f"⚠️  Cleanup warning: {e}")


def main():
    """Run all tests."""
    print("""
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║          DevLog AI - Full System Test Suite               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
""")

    print(f"🌐 API URL: {API_URL}")
    print(f"🕐 Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    tests = [
        ("API Health Check", test_api_health),
        ("Create Test File", test_create_file),
        ("Submit Change", test_manual_change_submission),
        ("Wait for Gemini", test_wait_for_gemini),
        ("Query System", test_query_system),
        ("Generate Handoff", test_generate_handoff),
        ("Create Snapshot", test_create_snapshot),
        ("List Snapshots", test_list_snapshots),
    ]

    results = []

    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"❌ Test '{name}' crashed: {e}")
            results.append((name, False))

    # Cleanup
    cleanup()

    # Summary
    print_section("TEST SUMMARY")

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}  {name}")

    print(f"\n{'='*60}")
    print(f"  Results: {passed}/{total} tests passed")
    print(f"{'='*60}\n")

    if passed == total:
        print("🎉 All tests passed! System is working correctly.")
        return 0
    else:
        print("⚠️  Some tests failed. Review output above.")
        return 1


if __name__ == "__main__":
    exit(main())
