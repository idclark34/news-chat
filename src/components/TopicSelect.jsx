import { TOPICS, today, getTopic } from "../constants.js";

function TopicAnimation({ id, color }) {
  const s = { color };
  switch (id) {
    case "ai":
      return (
        <svg viewBox="0 0 60 14" width="60" height="14" fill="currentColor" style={s}>
          {[0,1,2,3,4].map((i) => (
            <circle key={i} cx={6 + i * 12} cy="7" r="3" className="nc-anim-ai-dot" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
        </svg>
      );
    case "fitness":
      return (
        <svg viewBox="0 0 70 22" width="70" height="22" fill="none" style={s}>
          <polyline points="0,11 10,11 14,3 17,19 20,3 23,11 34,11 70,11"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="nc-anim-heartbeat" />
        </svg>
      );
    case "startups":
      return (
        <svg viewBox="0 0 52 20" width="52" height="20" style={s}>
          {[6, 11, 8, 16].map((h, i) => (
            <rect key={i} x={i * 13} y={20 - h} width="9" height={h} rx="2"
              fill="currentColor" className="nc-anim-bar" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </svg>
      );
    case "world":
      return (
        <svg viewBox="0 0 44 22" width="44" height="22" fill="none" style={s}>
          {[4, 8, 12].map((r, i) => (
            <circle key={i} cx="22" cy="11" r={r}
              stroke="currentColor" strokeWidth="1.2"
              className="nc-anim-ring" style={{ animationDelay: `${i * 0.5}s` }} />
          ))}
        </svg>
      );
    case "science":
      return (
        <svg viewBox="0 0 44 22" width="44" height="22" fill="none" style={s}>
          <circle cx="22" cy="11" r="3.5" fill="currentColor" opacity="0.7" />
          <circle cx="22" cy="11" r="9" stroke="currentColor" strokeWidth="1.2"
            strokeDasharray="5 3" className="nc-anim-spin" />
        </svg>
      );
    case "finance":
      return (
        <svg viewBox="0 0 70 22" width="70" height="22" fill="none" style={s}>
          <polyline points="0,20 14,16 28,11 38,13 52,7 70,2"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="nc-anim-chart" />
        </svg>
      );
    case "sports":
      return (
        <svg viewBox="0 0 44 26" width="44" height="26" fill="currentColor" style={s}>
          <circle cx="22" cy="9" r="6" className="nc-anim-bounce" />
          <ellipse cx="22" cy="24" rx="6" ry="1.8" opacity="0.18" className="nc-anim-shadow" />
        </svg>
      );
    case "entertainment":
      return (
        <svg viewBox="0 0 70 18" width="70" height="18" fill="currentColor" style={s}>
          {[[7,5],[18,13],[32,5],[46,13],[57,5],[66,10]].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="2.5"
              className="nc-anim-star" style={{ animationDelay: `${i * 0.28}s` }} />
          ))}
        </svg>
      );
    case "medicine":
      return (
        <svg viewBox="0 0 70 22" width="70" height="22" fill="none" style={s}>
          <polyline points="0,11 16,11 20,4 23,18 26,4 29,11 42,11 70,11"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="nc-anim-ekg" />
        </svg>
      );
    case "politics":
      return (
        <svg viewBox="0 0 70 18" width="70" height="18" fill="none" style={s}>
          {[3, 9, 15].map((y, i) => (
            <line key={i} x1="4" y1={y} x2="66" y2={y}
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              className="nc-anim-waveline" style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </svg>
      );
    default:
      return null;
  }
}

export default function TopicSelect({ selected, onToggle, onGenerate, cachedBriefing, onLoadCached, error, theme, onToggleTheme }) {
  return (
    <div className="nc-select">
      <div className="nc-select-hdr">
        <div className="nc-date">{today}</div>
        <button onClick={onToggleTheme} className="nc-theme-toggle">{theme === "dark" ? "☀️" : "🌙"}</button>
      </div>
      <h1 className="nc-hero">Your Daily<br/><span className="nc-grad">Briefing</span></h1>
      <p className="nc-sub">Choose what matters to you. We'll search the web for today's news and deliver it as a conversation.</p>

      {cachedBriefing && (
        <div className="nc-resume" onClick={onLoadCached}>
          <div className="nc-resume-left">
            <div className="nc-resume-dot" />
            <div>
              <div className="nc-resume-title">Resume today's briefing</div>
              <div className="nc-resume-meta">
                {cachedBriefing.topics.map((id) => getTopic(id).icon).join(" ")} · {cachedBriefing.messages.length} messages
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
            <div key={t.id} onClick={() => onToggle(t.id)} className={`nc-card ${on ? "on" : ""}`}
              style={{ "--tc": t.color }}>
              <div className="nc-card-top">
                <div className="nc-card-icon">{t.icon}</div>
                <div className={`nc-radio ${on ? "on" : ""}`}>{on && <div className="nc-radio-dot" />}</div>
              </div>
              <div className="nc-card-label">{t.label}</div>
              <div className="nc-card-desc">{t.desc}</div>
              <div className="nc-card-anim">
                <TopicAnimation id={t.id} color={t.color} />
              </div>
            </div>
          );
        })}
      </div>
      {error && <div className="nc-err">Failed: {error}. Try again.</div>}
      <button onClick={onGenerate} disabled={!selected.length} className="nc-cta" style={{ opacity: selected.length ? 1 : 0.25 }}>
        Generate Briefing <span className="nc-cta-n">{selected.length}</span>
      </button>
      <div className="nc-foot">Powered by Claude · Searches live web</div>
    </div>
  );
}
