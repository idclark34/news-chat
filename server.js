import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== "production";

// Database functions — loaded lazily to prevent startup crashes
let getCachedBriefing, saveBriefing, cleanOldBriefings;
let dbReady = false;

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

function buildPrompt(selectedTopics) {
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

Valid topic IDs are: ${selectedTopics.join(", ")}

Your entire response must be parseable by JSON.parse(). Start with [ and end with ].`;
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
  }));

  if (messages.length < 3) throw new Error("Too few messages parsed");

  return { messages, sources };
}

async function start() {
  console.log(`Starting server (NODE_ENV=${process.env.NODE_ENV}, PORT=${PORT}, isDev=${isDev})`);

  // Initialize database lazily — if it fails, the server still starts
  try {
    const db = await import("./src/db.js");
    getCachedBriefing = db.getCachedBriefing;
    saveBriefing = db.saveBriefing;
    cleanOldBriefings = db.cleanOldBriefings;
    cleanOldBriefings(7);
    dbReady = true;
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Database initialization failed:", err);
  }

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // ─── Health check ─────────────────────────────────────────────
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // ─── Briefing endpoint: cache-first, then LLM ─────────────────
  app.post("/api/briefings", async (req, res) => {
    if (!dbReady) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { topics } = req.body;

    if (!Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: "topics must be a non-empty array" });
    }
    if (!topics.every((t) => VALID_TOPIC_IDS.has(t))) {
      return res.status(400).json({ error: "Invalid topic ID" });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Check cache first
    const cached = getCachedBriefing(today, topics);
    if (cached) {
      console.log(`Cache hit for ${today}:${[...topics].sort().join(",")}`);
      return res.json({ messages: cached.messages, sources: cached.sources, cached: true });
    }

    // Cache miss — call Anthropic
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
    }

    console.log(`Cache miss for ${today}:${[...topics].sort().join(",")} — calling Anthropic`);

    try {
      const prompt = buildPrompt(topics);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16000,
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return res.status(response.status).json(errData);
      }

      const data = await response.json();
      const { messages, sources } = parseAnthropicResponse(data, topics);

      saveBriefing(today, topics, messages, sources);
      console.log(`Cached briefing for ${today}:${[...topics].sort().join(",")}`);

      res.json({ messages, sources, cached: false });
    } catch (err) {
      console.error("Briefing generation error:", err.message);
      res.status(502).json({ error: err.message });
    }
  });

  // ─── Legacy proxy route (kept for flexibility) ────────────────
  app.post("/api/anthropic/v1/messages", async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);
      res.json(data);
    } catch (err) {
      console.error("Anthropic API error:", err.message);
      res.status(502).json({ error: "Failed to reach Anthropic API." });
    }
  });

  // ─── Dev: attach Vite middleware ─────────────────────────────────
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // ─── Production: serve built static files ────────────────────
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (isDev) console.log("Vite dev server attached (HMR enabled)");
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
