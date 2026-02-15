import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== "production";

async function start() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // ─── API route: proxy to Anthropic ───────────────────────────────
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

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      res.json(data);
    } catch (err) {
      console.error("Anthropic API error:", err.message);
      res.status(502).json({ error: "Failed to reach Anthropic API." });
    }
  });

  // ─── Dev: attach Vite middleware ─────────────────────────────────
  if (isDev) {
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
