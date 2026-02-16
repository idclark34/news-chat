import { getTopic } from "../constants.js";

export default function LoadingScreen({ selected, loadStep }) {
  const steps = [
    "Searching the web for breaking stories",
    `Reading through ${selected.length * 3}+ sources`,
    "Identifying the biggest stories",
    "Building your conversation",
  ];

  return (
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
        {selected.map((id) => { const t = getTopic(id); return <span key={id} className="nc-lchip" style={{ "--tc": t.color }}>{t.icon} {t.label}</span>; })}
      </div>
    </div>
  );
}
