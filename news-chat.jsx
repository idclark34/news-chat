import { useState, useEffect, useRef } from "react";
import { fetchBriefing } from "./src/api.js";
import TopicSelect from "./src/components/TopicSelect.jsx";
import LoadingScreen from "./src/components/LoadingScreen.jsx";
import ChatView from "./src/components/ChatView.jsx";
import "./src/styles.css";

export default function App() {
  const [selected, setSelected] = useState([]);
  const [phase, setPhase] = useState("init");
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [loadStep, setLoadStep] = useState(0);
  const [cachedBriefing, setCachedBriefing] = useState(null);
  const [sources, setSources] = useState([]);
  const feedRef = useRef(null);
  const [theme, setTheme] = useState(() => {
    try { const s = localStorage.getItem("nc-theme"); if (s) return s; } catch {}
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("nc-theme", next); } catch {}
  };

  const themeClass = "nc-page" + (theme === "light" ? " light" : "");
  const todayKey = new Date().toISOString().slice(0, 10);

  // Save briefing to storage
  const saveBriefing = async (topics, msgs, srcs) => {
    try {
      await window.storage.set("nc-briefing", JSON.stringify({
        date: todayKey, topics, messages: msgs, sources: srcs,
      }));
    } catch (e) { console.error("Storage save failed:", e); }
  };

  // Load cached briefing on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get("nc-briefing");
        if (result) {
          const data = JSON.parse(result.value);
          if (data.date === todayKey && data.messages?.length > 0) {
            setCachedBriefing(data);
          }
        }
      } catch (e) { /* no cache */ }
      setPhase("select");
    })();
  }, []);

  // Loading step animation
  useEffect(() => {
    if (phase !== "loading") return;
    setLoadStep(0);
    let i = 0;
    const id = setInterval(() => { i++; if (i < 4) setLoadStep(i); }, 4500);
    return () => clearInterval(id);
  }, [phase]);

  // Message reveal animation
  useEffect(() => {
    if (phase !== "chat" || !messages.length) return;
    setVisibleCount(0);
    if (feedRef.current) feedRef.current.scrollTop = 0;
    let i = 0;
    const id = setInterval(() => { i++; setVisibleCount(i); if (i >= messages.length) clearInterval(id); }, 200);
    return () => clearInterval(id);
  }, [phase, messages]);

  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const fetchNews = async () => {
    setPhase("loading");
    setError(null);
    try {
      const result = await fetchBriefing(selected);
      await saveBriefing(selected, result.messages, result.sources);
      setSources(result.sources);
      setMessages(result.messages);
      setPhase("chat");
    } catch (err) { setError(err.message); setPhase("select"); }
  };

  const loadCached = () => {
    if (!cachedBriefing) return;
    setSelected(cachedBriefing.topics);
    setMessages(cachedBriefing.messages);
    setSources(cachedBriefing.sources || []);
    setPhase("chat");
  };

  const reset = () => { setPhase("select"); setMessages([]); setVisibleCount(0); setError(null); setSources([]); };

  // ═══════════ INIT ═══════════
  if (phase === "init") return (
    <div className={themeClass}>
      <div style={{ paddingTop: 200, textAlign: "center" }}>
        <div className="nc-spinner"><div className="nc-spin-ring" /></div>
      </div>
    </div>
  );

  // ═══════════ SELECT ═══════════
  if (phase === "select") return (
    <div className={themeClass}>
      <TopicSelect
        selected={selected} onToggle={toggle} onGenerate={fetchNews}
        cachedBriefing={cachedBriefing} onLoadCached={loadCached}
        error={error} theme={theme} onToggleTheme={toggleTheme}
      />
    </div>
  );

  // ═══════════ LOADING ═══════════
  if (phase === "loading") return (
    <div className={themeClass}>
      <LoadingScreen selected={selected} loadStep={loadStep} />
    </div>
  );

  // ═══════════ CHAT ═══════════
  return (
    <div className={themeClass}>
      <ChatView
        ref={feedRef} messages={messages} visibleCount={visibleCount}
        sources={sources} selected={selected} theme={theme}
        onToggleTheme={toggleTheme} onRefresh={fetchNews} onReset={reset}
      />
    </div>
  );
}
