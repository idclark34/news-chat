import { TOPICS } from "./constants.js";

export async function fetchBriefing(selectedTopics) {
  const topicNames = selectedTopics.map((id) => TOPICS.find((t) => t.id === id)?.label).join(", ");

  const userPrompt = `Search the web for TODAY's most important and recent news across these topics: ${topicNames}.

After searching, create a conversation between two people — Kai and Zoe — discussing the news you found in one natural chat thread. They weave between topics, connect stories, and react genuinely.

Rules:
- For the biggest story, go deep (6-8 messages). Smaller stories get 2-3 messages.
- Be conversational — not like a news anchor. Include real facts, numbers, names from what you found.
- They react to each other: surprise, humor, disagreement, connecting dots.
- 20-35 messages total. Transition naturally between topics.

You MUST respond with ONLY a valid JSON array. No markdown, no backticks, no extra text before or after. Each element must be exactly this shape:
[{"speaker":"Kai","text":"message text here","topic":"${selectedTopics[0]}"},{"speaker":"Zoe","text":"reply here","topic":"${selectedTopics[0]}"}]

Valid topic IDs are: ${selectedTopics.join(", ")}

Your entire response must be parseable by JSON.parse(). Start with [ and end with ].`;

  const resp = await fetch("/api/anthropic/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 16000, messages: [{ role: "user", content: userPrompt }], tools: [{ type: "web_search_20250305", name: "web_search" }] }),
  });

  if (!resp.ok) throw new Error(`API ${resp.status}`);

  const data = await resp.json();
  const blocks = data.content || [];

  // Extract citation sources from text block citations and web search result blocks
  const rawSources = [];
  for (const b of blocks) {
    if (b.type === "text" && b.citations) {
      for (const c of b.citations) {
        if (c.url && c.title) rawSources.push({ url: c.url, title: c.title });
      }
    }
    if (b.type === "web_search_tool_result" && b.content) {
      for (const r of b.content) {
        if (r.type === "web_search_result" && r.url && r.title) rawSources.push({ url: r.url, title: r.title });
      }
    }
  }
  const seen = new Set();
  const sources = rawSources.filter((s) => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });

  const fullText = blocks.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("\n");
  if (!fullText.trim()) throw new Error("Empty response");

  const cleaned = fullText.replace(/```json/g, "").replace(/```/g, "").trim();
  const si = cleaned.indexOf("["), ei = cleaned.lastIndexOf("]");
  if (si === -1 || ei <= si) throw new Error("No JSON array");

  let parsed;
  try { parsed = JSON.parse(cleaned.slice(si, ei + 1)); }
  catch { parsed = JSON.parse(cleaned.slice(si, ei + 1).replace(/,\s*]/g, "]").replace(/,\s*}/g, "}")); }

  const messages = parsed.filter((m) => m?.speaker && m?.text && typeof m.text === "string").map((m) => ({
    speaker: m.speaker === "Zoe" ? "Zoe" : "Kai",
    text: m.text,
    topic: selectedTopics.includes(m.topic) ? m.topic : selectedTopics[0],
  }));

  if (messages.length < 3) throw new Error("Too few messages");

  return { messages, sources };
}
