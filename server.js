const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const { getCachedBriefing, saveBriefing, cleanOldBriefings, getCachedNews, saveNews } = require("./src/db.js");

dotenv.config();

const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== "production";

const TOPICS = [
  { id: "ai", label: "AI & Tech" },
  { id: "fitness", label: "Fitness & Health" },
  { id: "startups", label: "Startups & Business" },
  { id: "world", label: "World News" },
  { id: "science", label: "Science" },
  { id: "finance", label: "Finance & Markets" },
  { id: "sports", label: "Sports" },
  { id: "entertainment", label: "Entertainment" },
  { id: "medicine", label: "Medicine" },
  { id: "politics", label: "Politics" },
];

const VALID_TOPIC_IDS = new Set(TOPICS.map((t) => t.id));

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildNewsPrompt(topicLabel) {
  return `Search the web for TODAY's most important and recent news about: ${topicLabel}.

Find the 5-7 most significant stories. Return ONLY a valid JSON object with exactly these two fields:

{
  "content": "A detailed plain text summary covering all stories. For each: headline, key facts, important numbers, names, quotes, and why it matters.",
  "headlines": ["3-5 ultra-short headlines (under 8 words each) in casual Gen Z style teasing the biggest stories. Punchy and fun but accurate. Use natural Gen Z phrasing where it fits — e.g. 'the fed did what 💀', 'this startup just ate ngl', 'scientists found something kinda unhinged'. Don't force it if it doesn't fit."]
}

Return ONLY valid JSON. No markdown, no backticks, no extra text before or after.`;
}

function buildDialoguePrompt(selectedTopics, newsMap) {
  const topicNames = selectedTopics.map((id) => TOPICS.find((t) => t.id === id)?.label).join(", ");
  const newsContent = selectedTopics
    .map((id) => {
      const label = TOPICS.find((t) => t.id === id)?.label;
      return `=== ${label} ===\n${newsMap[id]}`;
    })
    .join("\n\n");

  return `You have today's news summaries for these topics: ${topicNames}.

${newsContent}

Create a conversation between two people — Kai and Zoe — discussing this news in one natural chat thread. They weave between topics, connect stories, and react genuinely.

Rules:
- For the biggest story, go deep (6-8 messages). Smaller stories get 2-3 messages.
- Be conversational — not like a news anchor. Include real facts, numbers, names from the summaries above.
- They react to each other: surprise, humor, disagreement, connecting dots.
- 20-35 messages total. Transition naturally between topics.

You MUST respond with ONLY a valid JSON array. No markdown, no backticks, no extra text before or after. Each element must be exactly this shape:
[{"speaker":"Kai","text":"message text here","topic":"${selectedTopics[0]}"},{"speaker":"Zoe","text":"reply here","topic":"${selectedTopics[0]}"}]

Some messages may include an optional "suggestions" field — an array of 1-2 short questions (under 8 words each) a curious reader might want to ask about something specific mentioned in that message: a name, term, place, or concept. Only add suggestions when genuinely useful; most messages won't need them.
Example with suggestions: {"speaker":"Kai","text":"...","topic":"ai","suggestions":["Who is Sam Altman?","What is the EU AI Act?"]}

Valid topic IDs are: ${selectedTopics.join(", ")}

Your entire response must be parseable by JSON.parse(). Start with [ and end with ].`;
}

function buildFollowupPrompt(messageText, question, newsContent) {
  const context = newsContent ? `Today's news context:\n${newsContent}\n\n` : "";
  return `${context}In a news discussion, someone said: "${messageText}"

A reader wants to know: "${question}"

Have Kai and Zoe respond to this question in 3-5 short conversational messages. If it's about a person, place, or concept, explain it naturally in conversation. Stay grounded in the news context if provided.

Return ONLY a valid JSON array. No markdown, no backticks:
[{"speaker":"Kai","text":"..."},{"speaker":"Zoe","text":"..."}]
Start with [ and end with ].`;
}

function buildFullPrompt(selectedTopics) {
  const topicNames = selectedTopics.map((id) => TOPICS.find((t) => t.id === id)?.label).join(", ");

  return `Search the web for TODAY's most important and recent news across these topics: ${topicNames}.

After searching, create a conversation between two people — Kai and Zoe — discussing the news you found in one natural chat thread. They weave between topics, connect stories, and react genuinely.

Rules:
- For the biggest story, go deep (6-8 messages). Smaller stories get 2-3 messages.
- Be conversational — not like a news anchor. Include real facts, numbers, names from what you found.
- They react to each other: surprise, humor, disagreement, connecting dots.
- 20-35 messages total. Transition naturally between topics.

You MUST respond with ONLY a valid JSON array. No markdown, no backticks, no extra text before or after. Each element must be exactly this shape:
[{"speaker":"Kai","text":"message text here","topic":"${selectedTopics[0]}"},{"speaker":"Zoe","text":"reply here","topic":"${selectedTopics[0]}"}]

Some messages may include an optional "suggestions" field — an array of 1-2 short questions (under 8 words each) a curious reader might want to ask about something specific mentioned in that message: a name, term, place, or concept. Only add suggestions when genuinely useful; most messages won't need them.
Example with suggestions: {"speaker":"Kai","text":"...","topic":"ai","suggestions":["Who is Sam Altman?","What is the EU AI Act?"]}

Valid topic IDs are: ${selectedTopics.join(", ")}

Your entire response must be parseable by JSON.parse(). Start with [ and end with ].`;
}

// ─── Anthropic helpers ────────────────────────────────────────────────────────

async function callAnthropic(body, apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Anthropic API ${response.status}`);
  }
  return response.json();
}

function parseAnthropicResponse(data, selectedTopics) {
  const blocks = data.content || [];

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
  if (!fullText.trim()) throw new Error("Empty response from LLM");

  const cleaned = fullText.replace(/```json/g, "").replace(/```/g, "").trim();
  const si = cleaned.indexOf("["), ei = cleaned.lastIndexOf("]");
  if (si === -1 || ei <= si) throw new Error("No JSON array in response");

  let parsed;
  try { parsed = JSON.parse(cleaned.slice(si, ei + 1)); }
  catch { parsed = JSON.parse(cleaned.slice(si, ei + 1).replace(/,\s*]/g, "]").replace(/,\s*}/g, "}")); }

  const messages = parsed.filter((m) => m?.speaker && m?.text && typeof m.text === "string").map((m) => ({
    speaker: m.speaker === "Zoe" ? "Zoe" : "Kai",
    text: m.text,
    topic: selectedTopics.includes(m.topic) ? m.topic : selectedTopics[0],
    suggestions: Array.isArray(m.suggestions) && m.suggestions.length ? m.suggestions.slice(0, 2) : undefined,
  }));

  if (messages.length < 3) throw new Error("Too few messages parsed");

  return { messages, sources };
}

// Fetch raw news for a single topic (web search, no dialogue)
async function fetchNewsForTopic(topicId, apiKey) {
  const topic = TOPICS.find((t) => t.id === topicId);
  if (!topic) throw new Error(`Unknown topic: ${topicId}`);

  const data = await callAnthropic({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: buildNewsPrompt(topic.label) }],
    tools: [{ type: "web_search_20250305", name: "web_search" }],
  }, apiKey);

  const blocks = data.content || [];

  // Extract sources
  const rawSources = [];
  for (const b of blocks) {
    if (b.type === "web_search_tool_result" && b.content) {
      for (const r of b.content) {
        if (r.type === "web_search_result" && r.url && r.title) rawSources.push({ url: r.url, title: r.title });
      }
    }
  }
  const seen = new Set();
  const sources = rawSources.filter((s) => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });

  const rawText = blocks.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("\n");
  if (!rawText.trim()) throw new Error("Empty news response");

  // Parse structured JSON response
  let content = rawText;
  let headlines = [];
  try {
    const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const si = cleaned.indexOf("{"), ei = cleaned.lastIndexOf("}");
    if (si !== -1 && ei > si) {
      const parsed = JSON.parse(cleaned.slice(si, ei + 1));
      if (parsed.content) content = parsed.content;
      if (Array.isArray(parsed.headlines)) headlines = parsed.headlines.slice(0, 5);
    }
  } catch (_) { /* fall back to raw text as content */ }

  return { content, sources, headlines };
}

// Generate dialogue from pre-fetched news (no web search — fast)
async function generateDialogueFromNews(selectedTopics, newsMap, sourcesMap, apiKey) {
  const data = await callAnthropic({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    messages: [{ role: "user", content: buildDialoguePrompt(selectedTopics, newsMap) }],
  }, apiKey);

  const { messages } = parseAnthropicResponse(data, selectedTopics);

  // Combine sources from all selected topics
  const seen = new Set();
  const sources = selectedTopics
    .flatMap((id) => sourcesMap[id] || [])
    .filter((s) => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });

  return { messages, sources };
}

// ─── Pre-fetch scheduler ──────────────────────────────────────────────────────

async function prefetchAllTopics() {
  const today = new Date().toISOString().slice(0, 10);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[prefetch] No API key configured, skipping");
    return;
  }

  console.log(`[prefetch] Starting for ${today}`);
  let fetched = 0, skipped = 0;

  for (const topic of TOPICS) {
    if (getCachedNews(today, topic.id)) {
      skipped++;
      continue;
    }
    try {
      const { content, sources, headlines } = await fetchNewsForTopic(topic.id, apiKey);
      saveNews(today, topic.id, content, sources, headlines);
      fetched++;
      console.log(`[prefetch] ✓ ${topic.label}`);
    } catch (err) {
      console.error(`[prefetch] ✗ ${topic.label}:`, err.message);
    }
    // Stagger requests to avoid hammering the API
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[prefetch] Done — fetched ${fetched}, skipped ${skipped} already cached`);
}

function msUntilNext(hour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function schedulePrefetch(hour) {
  const delay = msUntilNext(hour);
  const mins = Math.round(delay / 1000 / 60);
  console.log(`[prefetch] Scheduled ${hour}:00 run in ${mins} min`);
  setTimeout(() => {
    prefetchAllTopics().catch((err) => console.error("[prefetch] Error:", err.message));
    schedulePrefetch(hour);
  }, delay);
}

// ─── Server ───────────────────────────────────────────────────────────────────

async function start() {
  console.log(`Starting server (NODE_ENV=${process.env.NODE_ENV}, PORT=${PORT}, isDev=${isDev})`);

  cleanOldBriefings(7);

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // ─── Health check ──────────────────────────────────────────────
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // ─── Headlines endpoint ────────────────────────────────────────
  app.get("/api/headlines", (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const result = {};
    for (const topic of TOPICS) {
      const cached = getCachedNews(today, topic.id);
      if (cached?.headlines?.length) result[topic.id] = cached.headlines;
    }
    res.json(result);
  });

  // ─── Prefetch status ───────────────────────────────────────────
  app.get("/api/prefetch-status", (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const status = TOPICS.map((t) => ({
      id: t.id,
      label: t.label,
      cached: !!getCachedNews(today, t.id),
    }));
    res.json({ date: today, topics: status });
  });

  // ─── Briefing endpoint ─────────────────────────────────────────
  app.post("/api/briefings", async (req, res) => {
    const { topics } = req.body;

    if (!Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: "topics must be a non-empty array" });
    }
    if (!topics.every((t) => VALID_TOPIC_IDS.has(t))) {
      return res.status(400).json({ error: "Invalid topic ID" });
    }

    const today = new Date().toISOString().slice(0, 10);

    // 1. Check dialogue cache first
    const cached = getCachedBriefing(today, topics);
    if (cached) {
      console.log(`[briefing] Cache hit for ${today}:${[...topics].sort().join(",")}`);
      return res.json({ messages: cached.messages, sources: cached.sources, cached: true });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
    }

    console.log(`[briefing] Cache miss for ${today}:${[...topics].sort().join(",")}`);

    try {
      let messages, sources;

      // 2. Check if all selected topics have pre-fetched news
      const newsMap = {};
      const sourcesMap = {};
      let allNewsCached = true;

      for (const topicId of topics) {
        const news = getCachedNews(today, topicId);
        if (news) {
          newsMap[topicId] = news.content;
          sourcesMap[topicId] = news.sources;
        } else {
          allNewsCached = false;
          break;
        }
      }

      if (allNewsCached) {
        // Fast path: generate dialogue from cached news (no web search)
        console.log(`[briefing] Using cached news → generating dialogue for ${topics.join(",")}`);
        ({ messages, sources } = await generateDialogueFromNews(topics, newsMap, sourcesMap, apiKey));
      } else {
        // Slow path: full web search + dialogue in one call
        console.log(`[briefing] No cached news → full web search for ${topics.join(",")}`);
        const data = await callAnthropic({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16000,
          messages: [{ role: "user", content: buildFullPrompt(topics) }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }, apiKey);
        ({ messages, sources } = parseAnthropicResponse(data, topics));
      }

      saveBriefing(today, topics, messages, sources);
      console.log(`[briefing] Cached result for ${today}:${[...topics].sort().join(",")}`);

      res.json({ messages, sources, cached: false });
    } catch (err) {
      console.error("[briefing] Error:", err.message);
      res.status(502).json({ error: err.message });
    }
  });

  // ─── Follow-up endpoint ────────────────────────────────────────
  app.post("/api/followup", async (req, res) => {
    const { message, question, topic } = req.body;
    if (!message || !question) {
      return res.status(400).json({ error: "message and question are required" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

    const today = new Date().toISOString().slice(0, 10);

    let newsContent = null;
    if (topic && VALID_TOPIC_IDS.has(topic)) {
      const cached = getCachedNews(today, topic);
      if (cached) newsContent = cached.content;
    }

    try {
      const data = await callAnthropic({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: buildFollowupPrompt(message, question, newsContent) }],
      }, apiKey);

      const blocks = data.content || [];
      const text = blocks.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("\n");
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const si = cleaned.indexOf("["), ei = cleaned.lastIndexOf("]");
      if (si === -1 || ei <= si) throw new Error("No JSON in response");

      let parsed;
      try { parsed = JSON.parse(cleaned.slice(si, ei + 1)); }
      catch { parsed = JSON.parse(cleaned.slice(si, ei + 1).replace(/,\s*]/g, "]").replace(/,\s*}/g, "}")); }

      const messages = parsed
        .filter((m) => m?.speaker && m?.text)
        .map((m) => ({ speaker: m.speaker === "Zoe" ? "Zoe" : "Kai", text: m.text }));

      if (!messages.length) throw new Error("Empty follow-up response");
      res.json({ messages });
    } catch (err) {
      console.error("[followup] Error:", err.message);
      res.status(502).json({ error: err.message });
    }
  });

  // ─── Dev: attach Vite middleware ────────────────────────────────
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (isDev) console.log("Vite dev server attached (HMR enabled)");
  });

  // Schedule pre-fetches at 8am and 5pm
  schedulePrefetch(8);
  schedulePrefetch(17);

  // Run an initial prefetch on startup for any topics not yet cached today
  prefetchAllTopics().catch((err) => console.error("[prefetch] Startup error:", err.message));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
