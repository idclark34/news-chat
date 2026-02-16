export const TOPICS = [
  { id: "ai", label: "AI & Tech", icon: "🤖", color: "#a855f7", desc: "Artificial intelligence, big tech, developer tools" },
  { id: "fitness", label: "Fitness & Health", icon: "💪", color: "#10b981", desc: "Training science, nutrition, wellness" },
  { id: "startups", label: "Startups & Business", icon: "🚀", color: "#f97316", desc: "Fundraising, launches, founder stories" },
  { id: "world", label: "World News", icon: "🌍", color: "#3b82f6", desc: "Geopolitics, policy, global events" },
  { id: "science", label: "Science", icon: "🔬", color: "#06b6d4", desc: "Breakthroughs, space, climate" },
  { id: "finance", label: "Finance & Markets", icon: "📈", color: "#eab308", desc: "Stocks, crypto, economics" },
  { id: "sports", label: "Sports", icon: "🏆", color: "#ef4444", desc: "Scores, trades, standings, big matchups" },
  { id: "entertainment", label: "Entertainment", icon: "🎬", color: "#ec4899", desc: "Movies, music, TV, celebrity news" },
  { id: "medicine", label: "Medicine", icon: "🩺", color: "#14b8a6", desc: "Drug approvals, clinical trials, health policy" },
  { id: "politics", label: "Politics", icon: "🏛️", color: "#8b5cf6", desc: "Elections, legislation, policy debates" },
];

export const SPEAKERS = {
  Kai: { color: "#a855f7", bg: "linear-gradient(135deg, #a855f7, #7c3aed)" },
  Zoe: { color: "#f43f5e", bg: "linear-gradient(135deg, #f43f5e, #be123c)" },
};

export const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export const getTopic = (id) => TOPICS.find((t) => t.id === id) || TOPICS[0];
