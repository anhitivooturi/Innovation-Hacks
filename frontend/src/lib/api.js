const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function postJson(path, body) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not configured.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  return response.json();
}

export async function queryDevlogRequest(question) {
  const payload = await postJson('/query', { question });

  return {
    answer:
      payload.answer ??
      payload.response ??
      'The backend responded without a formatted answer field.',
    sources: payload.sources ?? payload.citations ?? ['devlog'],
  };
}

export async function generateHandoffRequest() {
  const payload = await postJson('/handoff', {});

  return {
    content:
      payload.handoff_document ??
      payload.content ??
      payload.handoff ??
      'The backend responded, but no handoff content field was found.',
  };
}

export async function restoreSnapshotRequest(snapshotId) {
  return postJson(`/restore/${snapshotId}`, {});
}
