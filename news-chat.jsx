import { useState, useEffect, useRef } from "react";

const TOPICS = [
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

const SPEAKERS = {
  Kai: { color: "#a855f7", bg: "linear-gradient(135deg, #a855f7, #7c3aed)" },
  Zoe: { color: "#f43f5e", bg: "linear-gradient(135deg, #f43f5e, #be123c)" },
};

const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export default function App() {
  const [selected, setSelected] = useState([]);
  const [phase, setPhase] = useState("init");
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [loadStep, setLoadStep] = useState(0);
  const [cachedBriefing, setCachedBriefing] = useState(null);
  const feedRef = useRef(null);

  const todayKey = new Date().toISOString().slice(0, 10); // "2026-02-15"

  // Save briefing to storage
  const saveBriefing = async (topics, msgs) => {
    try {
      await window.storage.set("nc-briefing", JSON.stringify({
        date: todayKey,
        topics,
        messages: msgs,
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

  useEffect(() => {
    if (phase !== "loading") return;
    setLoadStep(0);
    let i = 0;
    const id = setInterval(() => { i++; if (i < 4) setLoadStep(i); }, 4500);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "chat" || !messages.length) return;
    setVisibleCount(0);
    // Reset scroll to top when chat loads
    if (feedRef.current) feedRef.current.scrollTop = 0;
    let i = 0;
    const id = setInterval(() => { i++; setVisibleCount(i); if (i >= messages.length) clearInterval(id); }, 200);
    return () => clearInterval(id);
  }, [phase, messages]);

  // No auto-scroll — let the user read from the top at their own pace

  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const fetchNews = async () => {
    setPhase("loading");
    setError(null);
    const topicNames = selected.map((id) => TOPICS.find((t) => t.id === id)?.label).join(", ");
    const userPrompt = `Search the web for TODAY's most important and recent news across these topics: ${topicNames}.

After searching, create a conversation between two people — Kai and Zoe — discussing the news you found in one natural chat thread. They weave between topics, connect stories, and react genuinely.

Rules:
- For the biggest story, go deep (6-8 messages). Smaller stories get 2-3 messages.
- Be conversational — not like a news anchor. Include real facts, numbers, names from what you found.
- They react to each other: surprise, humor, disagreement, connecting dots.
- 20-35 messages total. Transition naturally between topics.

You MUST respond with ONLY a valid JSON array. No markdown, no backticks, no extra text before or after. Each element must be exactly this shape:
[{"speaker":"Kai","text":"message text here","topic":"${selected[0]}"},{"speaker":"Zoe","text":"reply here","topic":"${selected[0]}"}]

Valid topic IDs are: ${selected.join(", ")}

Your entire response must be parseable by JSON.parse(). Start with [ and end with ].`;

    try {
      const resp = await fetch("/api/anthropic/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 16000, messages: [{ role: "user", content: userPrompt }], tools: [{ type: "web_search_20250305", name: "web_search" }] }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      const fullText = (data.content || []).filter((b) => b.type === "text" && b.text).map((b) => b.text).join("\n");
      if (!fullText.trim()) throw new Error("Empty response");
      const cleaned = fullText.replace(/```json/g, "").replace(/```/g, "").trim();
      const si = cleaned.indexOf("["), ei = cleaned.lastIndexOf("]");
      if (si === -1 || ei <= si) throw new Error("No JSON array");
      let parsed;
      try { parsed = JSON.parse(cleaned.slice(si, ei + 1)); }
      catch { parsed = JSON.parse(cleaned.slice(si, ei + 1).replace(/,\s*]/g, "]").replace(/,\s*}/g, "}")); }
      const valid = parsed.filter((m) => m?.speaker && m?.text && typeof m.text === "string").map((m) => ({
        speaker: m.speaker === "Zoe" ? "Zoe" : "Kai", text: m.text, topic: selected.includes(m.topic) ? m.topic : selected[0],
      }));
      if (valid.length < 3) throw new Error("Too few messages");
      await saveBriefing(selected, valid);
      setMessages(valid);
      setPhase("chat");
    } catch (err) { setError(err.message); setPhase("select"); }
  };

  const loadCached = () => {
    if (!cachedBriefing) return;
    setSelected(cachedBriefing.topics);
    setMessages(cachedBriefing.messages);
    setPhase("chat");
  };

  const refreshBriefing = () => {
    // Re-fetch with current topics
    fetchNews();
  };

  const reset = () => { setPhase("select"); setMessages([]); setVisibleCount(0); setError(null); };
  const getT = (id) => TOPICS.find((t) => t.id === id) || TOPICS[0];

  // ═══════════ INIT (checking cache) ═══════════
  if (phase === "init") return (
    <div className="nc-page"><style>{CSS}</style>
      <div style={{ paddingTop: 200, textAlign: "center" }}>
        <div className="nc-spinner"><div className="nc-spin-ring" /></div>
      </div>
    </div>
  );

  // ═══════════ SELECT ═══════════
  if (phase === "select") return (
    <div className="nc-page">
      <style>{CSS}</style>
      <div className="nc-select">
        <div className="nc-date">{today}</div>
        <h1 className="nc-hero">Your Daily<br/><span className="nc-grad">Briefing</span></h1>
        <p className="nc-sub">Choose what matters to you. We'll search the web for today's news and deliver it as a conversation.</p>

        {cachedBriefing && (
          <div className="nc-resume" onClick={loadCached}>
            <div className="nc-resume-left">
              <div className="nc-resume-dot" />
              <div>
                <div className="nc-resume-title">Resume today's briefing</div>
                <div className="nc-resume-meta">
                  {cachedBriefing.topics.map((id) => getT(id).icon).join(" ")} · {cachedBriefing.messages.length} messages
                </div>
              </div>
            </div>
            <div className="nc-resume-arrow">→</div>
          </div>
        )}
        <div className="nc-grid">
          {TOPICS.map((t) => {
            const on = selected.includes(t.id);
            return (
              <div key={t.id} onClick={() => toggle(t.id)} className={`nc-card ${on ? "on" : ""}`}
                style={{ "--tc": t.color }}>
                <div className="nc-card-top">
                  <div className="nc-card-icon">{t.icon}</div>
                  <div className={`nc-radio ${on ? "on" : ""}`}>{on && <div className="nc-radio-dot" />}</div>
                </div>
                <div className="nc-card-label">{t.label}</div>
                <div className="nc-card-desc">{t.desc}</div>
              </div>
            );
          })}
        </div>
        {error && <div className="nc-err">Failed: {error}. Try again.</div>}
        <button onClick={fetchNews} disabled={!selected.length} className="nc-cta" style={{ opacity: selected.length ? 1 : 0.25 }}>
          Generate Briefing <span className="nc-cta-n">{selected.length}</span>
        </button>
        <div className="nc-foot">Powered by Claude · Searches live web</div>
      </div>
    </div>
  );

  // ═══════════ LOADING ═══════════
  if (phase === "loading") {
    const steps = ["Searching the web for breaking stories", `Reading through ${selected.length * 3}+ sources`, "Identifying the biggest stories", "Building your conversation"];
    return (
      <div className="nc-page"><style>{CSS}</style>
        <div className="nc-load">
          <div className="nc-spinner"><div className="nc-spin-ring" /></div>
          <div className="nc-steps">
            {steps.map((s, i) => (
              <div key={i} className={`nc-step ${i < loadStep ? "done" : i === loadStep ? "active" : "wait"}`}>
                <div className="nc-step-dot" />
                <span>{s}</span>
              </div>
            ))}
          </div>
          <div className="nc-load-chips">
            {selected.map((id) => { const t = getT(id); return <span key={id} className="nc-lchip" style={{ "--tc": t.color }}>{t.icon} {t.label}</span>; })}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════ CHAT ═══════════
  let lastSp = null, lastTp = null;
  return (
    <div className="nc-page"><style>{CSS}</style>
      <div className="nc-chat">
        <div className="nc-chat-hdr">
          <div className="nc-chat-hdr-l">
            <div className="nc-chat-logo"><div className="nc-chat-logo-d" /></div>
            <div>
              <div className="nc-chat-title">Today's Briefing</div>
              <div className="nc-chat-meta">{today} · {messages.length} messages</div>
            </div>
          </div>
          <div className="nc-tags">
            {selected.map((id) => { const t = getT(id); return <span key={id} className="nc-tag" style={{ "--tc": t.color }}>{t.icon}</span>; })}
          </div>
          <button onClick={refreshBriefing} className="nc-refresh-btn">↻ Refresh</button>
          <button onClick={reset} className="nc-new-btn">New</button>
        </div>
        <div ref={feedRef} className="nc-feed">
          {messages.slice(0, visibleCount).map((msg, i) => {
            const sp = SPEAKERS[msg.speaker] || SPEAKERS.Kai;
            const chain = msg.speaker === lastSp;
            const topicSwitch = msg.topic !== lastTp;
            const tInfo = getT(msg.topic);
            lastSp = msg.speaker; lastTp = msg.topic;
            return (
              <div key={i}>
                {topicSwitch && (
                  <div className="nc-div"><div className="nc-div-line" /><span className="nc-div-pill" style={{ "--tc": tInfo.color }}>{tInfo.icon} {tInfo.label}</span><div className="nc-div-line" /></div>
                )}
                <div className={`nc-msg ${chain ? "chain" : ""}`} style={{ animationDelay: "0s" }}>
                  {!chain ? <div className="nc-av" style={{ background: sp.bg }}>{msg.speaker[0]}</div> : <div style={{ width: 36 }} />}
                  <div className="nc-msg-bd">
                    {!chain && <div className="nc-msg-name" style={{ color: sp.color }}>{msg.speaker}</div>}
                    <div className="nc-msg-text">{msg.text}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {visibleCount < messages.length && (
            <div className="nc-typing">{[0, 1, 2].map((i) => <div key={i} className="nc-tdot" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
          )}
          {visibleCount >= messages.length && messages.length > 0 && (
            <div className="nc-end">
              <div className="nc-end-bar" />
              <div className="nc-end-label">End of briefing · {messages.length} messages across {selected.length} topics</div>
              <button onClick={reset} className="nc-end-btn">Choose New Topics</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');

  .nc-page { width:100%; min-height:100vh; background:#06070b; display:flex; justify-content:center; padding:20px; font-family:'Sora',sans-serif; box-sizing:border-box; }
  .nc-page *, .nc-page *::before, .nc-page *::after { box-sizing:border-box; }

  /* ── SELECT ── */
  .nc-select { width:100%; max-width:520px; padding-top:48px; animation:ncFadeUp .5s ease; }
  .nc-date { font-size:11px; font-weight:600; color:#33334a; letter-spacing:.08em; text-transform:uppercase; margin-bottom:16px; }
  .nc-hero { font-size:42px; font-weight:800; color:#ececf5; line-height:1.08; letter-spacing:-.04em; margin:0 0 14px; }
  .nc-grad { background:linear-gradient(90deg,#a855f7,#f43f5e); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .nc-sub { font-size:15px; font-weight:400; color:#55556d; line-height:1.6; margin:0 0 36px; max-width:380px; }

  .nc-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:28px; }

  .nc-card {
    border:1px solid rgba(255,255,255,.04); border-radius:14px; padding:16px 14px 14px;
    cursor:pointer; transition:all .2s ease; position:relative; overflow:hidden;
    background:rgba(255,255,255,.008);
  }
  .nc-card::before {
    content:''; position:absolute; inset:0; opacity:0; transition:opacity .2s ease;
    background:radial-gradient(circle at 30% 30%, var(--tc, #a855f7)08, transparent 70%);
  }
  .nc-card.on { border-color:color-mix(in srgb, var(--tc) 30%, transparent); }
  .nc-card.on::before { opacity:1; }
  .nc-card:hover { border-color:rgba(255,255,255,.08); }
  .nc-card.on:hover { border-color:color-mix(in srgb, var(--tc) 40%, transparent); }

  .nc-card-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; position:relative; z-index:1; }
  .nc-card-icon {
    width:40px; height:40px; border-radius:10px;
    background:rgba(255,255,255,.025); border:1px solid rgba(255,255,255,.04);
    display:flex; align-items:center; justify-content:center; font-size:20px;
    transition:all .2s ease;
  }
  .nc-card.on .nc-card-icon { background:color-mix(in srgb, var(--tc) 12%, transparent); border-color:color-mix(in srgb, var(--tc) 20%, transparent); }

  .nc-radio {
    width:18px; height:18px; border-radius:50%; border:2px solid rgba(255,255,255,.07);
    display:flex; align-items:center; justify-content:center; transition:all .2s ease;
  }
  .nc-radio.on { border-color:var(--tc); background:var(--tc); }
  .nc-radio-dot { width:6px; height:6px; border-radius:50%; background:white; }

  .nc-card-label { font-size:14px; font-weight:700; color:#7a7a94; margin-bottom:3px; letter-spacing:-.01em; transition:color .2s; position:relative; z-index:1; }
  .nc-card.on .nc-card-label { color:#e0e0ee; }
  .nc-card-desc { font-size:11.5px; color:#3a3a52; line-height:1.4; position:relative; z-index:1; }

  .nc-err { background:rgba(239,68,68,.05); border:1px solid rgba(239,68,68,.12); border-radius:10px; padding:11px 14px; margin-bottom:14px; font-size:13px; color:#f87171; text-align:center; }

  .nc-cta {
    width:100%; padding:16px; border:none; border-radius:14px; cursor:pointer;
    background:linear-gradient(135deg,#a855f7,#7c3aed); font-family:'Sora',sans-serif;
    font-size:15px; font-weight:700; color:white; letter-spacing:-.01em;
    display:flex; align-items:center; justify-content:center; gap:10px;
    transition:all .2s ease; position:relative; overflow:hidden;
  }
  .nc-cta:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 8px 30px #a855f730; }
  .nc-cta:active { transform:translateY(0); }
  .nc-cta:disabled { cursor:not-allowed; }
  .nc-cta-n { background:rgba(255,255,255,.2); border-radius:8px; padding:2px 9px; font-size:13px; }

  .nc-foot { text-align:center; font-size:11px; color:#22223a; margin-top:20px; letter-spacing:.02em; }

  /* Resume card */
  .nc-resume {
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 16px; margin-bottom:20px;
    background:linear-gradient(135deg, rgba(168,85,247,.06), rgba(168,85,247,.02));
    border:1px solid rgba(168,85,247,.15); border-radius:12px;
    cursor:pointer; transition:all .2s ease;
  }
  .nc-resume:hover { border-color:rgba(168,85,247,.25); background:linear-gradient(135deg, rgba(168,85,247,.08), rgba(168,85,247,.03)); }
  .nc-resume-left { display:flex; align-items:center; gap:12px; }
  .nc-resume-dot { width:10px; height:10px; border-radius:50%; background:#a855f7; box-shadow:0 0 12px rgba(168,85,247,.4); flex-shrink:0; }
  .nc-resume-title { font-size:14px; font-weight:700; color:#d8d8ee; letter-spacing:-.01em; }
  .nc-resume-meta { font-size:11.5px; color:#55556d; margin-top:2px; }
  .nc-resume-arrow { font-size:18px; color:#a855f7; font-weight:300; }

  /* ── LOADING ── */
  .nc-load { width:100%; max-width:380px; text-align:center; padding-top:100px; animation:ncFadeUp .4s ease; }

  .nc-spinner { width:56px; height:56px; margin:0 auto 36px; position:relative; }
  .nc-spin-ring {
    width:56px; height:56px; border-radius:50%;
    border:2px solid rgba(255,255,255,.03); border-top-color:#a855f7;
    animation:ncSpin 1s linear infinite; position:absolute; inset:0;
  }

  .nc-steps { display:flex; flex-direction:column; gap:16px; text-align:left; max-width:310px; margin:0 auto 36px; }
  .nc-step { display:flex; align-items:center; gap:12px; font-size:13.5px; font-weight:500; transition:all .5s ease; }
  .nc-step.wait { color:#2a2a3e; }
  .nc-step.active { color:#e0e0ee; }
  .nc-step.done { color:#4a4a62; }

  .nc-step-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; transition:all .5s ease; background:#1a1a2e; }
  .nc-step.active .nc-step-dot { background:#a855f7; box-shadow:0 0 14px #a855f740; }
  .nc-step.done .nc-step-dot { background:#10b981; }

  .nc-load-chips { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; }
  .nc-lchip { font-size:11px; font-weight:600; padding:4px 10px; border-radius:8px; border:1px solid color-mix(in srgb, var(--tc) 20%, transparent); color:var(--tc); background:rgba(255,255,255,.01); }

  /* ── CHAT ── */
  .nc-chat {
    width:100%; max-width:640px; background:#0a0b11;
    border-radius:18px; overflow:hidden;
    border:1px solid rgba(255,255,255,.04);
    box-shadow:0 50px 120px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.02);
    display:flex; flex-direction:column; max-height:92vh;
    animation:ncFadeUp .4s ease;
  }

  .nc-chat-hdr {
    padding:14px 18px; display:flex; align-items:center; gap:10px;
    background:rgba(0,0,0,.3); border-bottom:1px solid rgba(255,255,255,.03); flex-shrink:0;
  }
  .nc-chat-hdr-l { display:flex; align-items:center; gap:10px; flex:1; }
  .nc-chat-logo {
    width:32px; height:32px; border-radius:9px;
    background:linear-gradient(135deg,#a855f7,#7c3aed);
    display:flex; align-items:center; justify-content:center;
  }
  .nc-chat-logo-d { width:8px; height:8px; border-radius:2px; background:rgba(255,255,255,.8); transform:rotate(45deg); }
  .nc-chat-title { font-size:14px; font-weight:700; color:#e0e0ee; letter-spacing:-.02em; }
  .nc-chat-meta { font-size:10.5px; color:#33334a; font-weight:500; }

  .nc-tags { display:flex; gap:4px; }
  .nc-tag {
    font-size:13px; padding:3px 6px; border-radius:6px; line-height:1;
    border:1px solid color-mix(in srgb, var(--tc) 15%, transparent);
    color:var(--tc); background:color-mix(in srgb, var(--tc) 5%, transparent);
  }

  .nc-new-btn {
    font-size:11px; font-weight:700; color:#55556d; background:rgba(255,255,255,.03);
    border:1px solid rgba(255,255,255,.05); border-radius:8px; padding:6px 12px;
    cursor:pointer; font-family:'Sora',sans-serif; letter-spacing:.02em; margin-left:4px;
  }
  .nc-new-btn:hover { background:rgba(255,255,255,.06); color:#8888a0; }

  .nc-refresh-btn {
    font-size:11px; font-weight:700; color:#a855f7; background:rgba(168,85,247,.06);
    border:1px solid rgba(168,85,247,.12); border-radius:8px; padding:6px 12px;
    cursor:pointer; font-family:'Sora',sans-serif; letter-spacing:.02em; margin-left:6px;
  }
  .nc-refresh-btn:hover { background:rgba(168,85,247,.1); }

  .nc-feed { flex:1; overflow-y:auto; padding:8px 0 20px; }
  .nc-feed::-webkit-scrollbar { width:4px; }
  .nc-feed::-webkit-scrollbar-track { background:transparent; }
  .nc-feed::-webkit-scrollbar-thumb { background:rgba(255,255,255,.05); border-radius:4px; }

  .nc-div { display:flex; align-items:center; gap:10px; padding:10px 20px; margin:8px 0; }
  .nc-div-line { flex:1; height:1px; background:rgba(255,255,255,.025); }
  .nc-div-pill {
    font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
    padding:4px 12px; border-radius:6px; white-space:nowrap;
    border:1px solid color-mix(in srgb, var(--tc) 18%, transparent);
    color:var(--tc); background:color-mix(in srgb, var(--tc) 5%, transparent);
  }

  .nc-msg {
    display:flex; gap:12px; padding:10px 20px 4px;
    animation:ncMsgIn .3s ease both;
  }
  .nc-msg.chain { padding-top:2px; }
  .nc-msg:hover { background:rgba(255,255,255,.005); }

  .nc-av {
    width:36px; height:36px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-weight:700; font-size:14px; color:white;
    box-shadow:0 2px 8px rgba(0,0,0,.2);
  }
  .nc-msg-bd { flex:1; min-width:0; }
  .nc-msg-name { font-size:13px; font-weight:700; margin-bottom:2px; }
  .nc-msg-text { font-size:14.5px; line-height:1.6; color:#9090a8; font-weight:400; }

  .nc-typing { display:flex; gap:5px; padding:14px 20px 14px 68px; }
  .nc-tdot { width:6px; height:6px; border-radius:50%; background:rgba(168,85,247,.25); animation:ncDotBounce .7s ease infinite; }

  .nc-end { text-align:center; padding:28px 20px 12px; }
  .nc-end-bar { width:40px; height:2px; background:rgba(255,255,255,.03); border-radius:2px; margin:0 auto 14px; }
  .nc-end-label { font-size:12px; color:#33334a; font-weight:500; margin-bottom:14px; }
  .nc-end-btn {
    font-size:12px; font-weight:700; color:#a855f7;
    background:rgba(168,85,247,.06); border:1px solid rgba(168,85,247,.12);
    border-radius:10px; padding:9px 18px; cursor:pointer; font-family:'Sora',sans-serif;
  }
  .nc-end-btn:hover { background:rgba(168,85,247,.1); }

  @keyframes ncFadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ncMsgIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ncSpin { to{transform:rotate(360deg)} }
  @keyframes ncDotBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
`;
