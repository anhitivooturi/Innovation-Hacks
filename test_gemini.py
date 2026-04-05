import google.genai as genai

client = genai.Client(
    vertexai=True,
    project="devlog-vibhor-gemini",
    location="us-central1"
)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Say hello from DevLog AI in one sentence."
)

print(response.text)
