import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "briefings.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS briefings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    date TEXT NOT NULL,
    topics TEXT NOT NULL,
    messages TEXT NOT NULL,
    sources TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

function buildCacheKey(date, topics) {
  return `${date}:${[...topics].sort().join(",")}`;
}

export function getCachedBriefing(date, topics) {
  const key = buildCacheKey(date, topics);
  const row = db.prepare("SELECT topics, messages, sources FROM briefings WHERE cache_key = ?").get(key);
  if (!row) return null;
  return {
    topics: JSON.parse(row.topics),
    messages: JSON.parse(row.messages),
    sources: JSON.parse(row.sources),
  };
}

export function saveBriefing(date, topics, messages, sources) {
  const key = buildCacheKey(date, topics);
  db.prepare(`
    INSERT OR REPLACE INTO briefings (cache_key, date, topics, messages, sources)
    VALUES (?, ?, ?, ?, ?)
  `).run(key, date, JSON.stringify(topics), JSON.stringify(messages), JSON.stringify(sources));
}

export function cleanOldBriefings(daysToKeep = 7) {
  const result = db.prepare("DELETE FROM briefings WHERE date < date('now', ? || ' days')").run(`-${daysToKeep}`);
  if (result.changes > 0) {
    console.log(`Cleaned ${result.changes} old briefing(s) from cache`);
  }
}
