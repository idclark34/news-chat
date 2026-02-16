import { TOPICS, today, getTopic } from "../constants.js";

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
