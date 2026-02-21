const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

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

db.exec(`
  CREATE TABLE IF NOT EXISTS news_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id TEXT NOT NULL,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    sources TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(topic_id, date)
  )
`);

function buildCacheKey(date, topics) {
  return `${date}:${[...topics].sort().join(",")}`;
}

function getCachedBriefing(date, topics) {
  const key = buildCacheKey(date, topics);
  const row = db.prepare("SELECT topics, messages, sources FROM briefings WHERE cache_key = ?").get(key);
  if (!row) return null;
  return {
    topics: JSON.parse(row.topics),
    messages: JSON.parse(row.messages),
    sources: JSON.parse(row.sources),
  };
}

function saveBriefing(date, topics, messages, sources) {
  const key = buildCacheKey(date, topics);
  db.prepare(`
    INSERT OR REPLACE INTO briefings (cache_key, date, topics, messages, sources)
    VALUES (?, ?, ?, ?, ?)
  `).run(key, date, JSON.stringify(topics), JSON.stringify(messages), JSON.stringify(sources));
}

function cleanOldBriefings(daysToKeep = 7) {
  const cutoff = `-${daysToKeep}`;
  const b = db.prepare("DELETE FROM briefings WHERE date < date('now', ? || ' days')").run(cutoff);
  const n = db.prepare("DELETE FROM news_cache WHERE date < date('now', ? || ' days')").run(cutoff);
  if (b.changes > 0) console.log(`Cleaned ${b.changes} old briefing(s) from cache`);
  if (n.changes > 0) console.log(`Cleaned ${n.changes} old news cache entries`);
}

function getCachedNews(date, topicId) {
  const row = db.prepare("SELECT content, sources FROM news_cache WHERE topic_id = ? AND date = ?").get(topicId, date);
  if (!row) return null;
  return { content: row.content, sources: JSON.parse(row.sources) };
}

function saveNews(date, topicId, content, sources) {
  db.prepare("INSERT OR REPLACE INTO news_cache (topic_id, date, content, sources) VALUES (?, ?, ?, ?)").run(
    topicId, date, content, JSON.stringify(sources)
  );
}

module.exports = { getCachedBriefing, saveBriefing, cleanOldBriefings, getCachedNews, saveNews };
