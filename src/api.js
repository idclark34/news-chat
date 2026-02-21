export async function fetchFollowup(message, question, topic) {
  const resp = await fetch("/api/followup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, question, topic }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `API ${resp.status}`);
  }
  return resp.json();
}

export async function fetchBriefing(selectedTopics) {
  const resp = await fetch("/api/briefings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topics: selectedTopics }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `API ${resp.status}`);
  }

  return resp.json();
}
