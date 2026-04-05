import google.genai as genai

client = genai.Client(
    vertexai=True,
    project="project-5f6bf043-2561-48a7-af4",
    location="us-central1"
)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Say hello from DevLog AI in one sentence."
)

print(response.text)
