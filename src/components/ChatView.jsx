import { useState, forwardRef } from "react";
import { SPEAKERS, today, getTopic } from "../constants.js";

const ChatView = forwardRef(function ChatView({ messages, visibleCount, sources, selected, theme, onToggleTheme, onRefresh, onReset }, feedRef) {
  const [refsOpen, setRefsOpen] = useState(false);

  let lastSp = null, lastTp = null;
  return (
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
          {selected.map((id) => { const t = getTopic(id); return <span key={id} className="nc-tag" style={{ "--tc": t.color }}>{t.icon}</span>; })}
        </div>
        <button onClick={onToggleTheme} className="nc-theme-toggle">{theme === "dark" ? "☀️" : "🌙"}</button>
        <button onClick={onRefresh} className="nc-refresh-btn">↻ Refresh</button>
        <button onClick={onReset} className="nc-new-btn">New</button>
      </div>
      <div ref={feedRef} className="nc-feed">
        {messages.slice(0, visibleCount).map((msg, i) => {
          const sp = SPEAKERS[msg.speaker] || SPEAKERS.Kai;
          const chain = msg.speaker === lastSp;
          const topicSwitch = msg.topic !== lastTp;
          const tInfo = getTopic(msg.topic);
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
            {sources.length > 0 && (
              <>
                <div className="nc-refs-toggle" onClick={() => setRefsOpen((o) => !o)}>
                  <span className={`nc-refs-chevron ${refsOpen ? "open" : ""}`}>›</span>
                  <span>🔗 {sources.length} source{sources.length !== 1 ? "s" : ""}</span>
                </div>
                <div className={`nc-refs-list ${refsOpen ? "open" : ""}`}>
                  {sources.map((s, i) => {
                    let domain; try { domain = new URL(s.url).hostname.replace(/^www\./, ""); } catch { domain = ""; }
                    return (
                      <a key={i} className="nc-ref-item" href={s.url} target="_blank" rel="noopener noreferrer">
                        <span className="nc-ref-title">{s.title}</span>
                        {domain && <span className="nc-ref-domain">{domain}</span>}
                      </a>
                    );
                  })}
                </div>
              </>
            )}
            <button onClick={onReset} className="nc-end-btn">Choose New Topics</button>
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatView;
