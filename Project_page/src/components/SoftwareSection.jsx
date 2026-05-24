import { useMemo, useState } from "react";
import { softwareTechCards, softwareViews } from "../data/softwareData.js";
import "../styles/software.css";

const Icon = ({ name }) => {
  const icons = {
    dashboard: <path d="M4 5h16v14H4V5Zm3 4h5v7H7V9Zm8 0h2M15 13h2" />,
    backend: <path d="M8 7h8M8 12h8M8 17h5M4 7h.01M4 12h.01M4 17h.01" />,
    pipeline: <path d="M5 7h5v5H5V7Zm9 5h5v5h-5v-5ZM10 9.5h4M12 9.5v5" />,
    check: <path d="m5 12 4 4L19 6" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {icons[name] || icons.dashboard}
    </svg>
  );
};

const DashboardPreview = () => (
  <div className="software-preview software-preview--dashboard">
    <div className="software-browser">
      <div className="software-browser__bar">
        <span></span>
        <span></span>
        <span></span>
        <strong>spectron-web</strong>
      </div>
      <div className="software-browser__body">
        <aside className="software-sidebar">
          <span className="active">Controllers</span>
          <span>Monitoring</span>
          <span>Alerts</span>
          <span>Admin</span>
        </aside>
        <div className="software-dashboard">
          <div>
            <p className="software-preview__eyebrow">Controller Dashboard</p>
            <h3>CTRL-MOCK-001</h3>
          </div>
          <div className="software-sensor-grid">
            {[
              ["Temperature", "31.4 C", "OK"],
              ["Humidity", "67%", "OK"],
              ["Gas Level", "Normal", "OK"],
              ["Light", "420 lx", "LIVE"],
            ].map(([label, value, status]) => (
              <article className="software-sensor-card" key={label}>
                <span>{status}</span>
                <strong>{value}</strong>
                <p>{label}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const BackendPreview = () => (
  <div className="software-preview software-preview--backend">
    <div className="software-code-card">
      <p className="software-preview__eyebrow">Go API routes</p>
      <h3>spectron-backend</h3>
      <ul>
        <li>
          <span>POST</span>
          <code>/auth/login</code>
        </li>
        <li>
          <span>POST</span>
          <code>/api/controllers/pair</code>
        </li>
        <li>
          <span>GET</span>
          <code>/api/controllers/my</code>
        </li>
        <li>
          <span>POST</span>
          <code>/api/iot/upload</code>
        </li>
        <li>
          <span>GET</span>
          <code>/api/admin/system</code>
        </li>
      </ul>
    </div>
  </div>
);

const PipelinePreview = () => (
  <div className="software-preview software-preview--pipeline">
    <div className="pipeline-flow" aria-label="Telemetry pipeline preview">
      {[
        ["MQTT", "device topics"],
        ["Bridge", "validate + publish"],
        ["Kafka", "raw readings"],
        ["Consumer", "process events"],
        ["PostgreSQL", "readings + alerts"],
      ].map(([title, text], index) => (
        <div className="pipeline-flow__step" key={title}>
          <span>{index + 1}</span>
          <strong>{title}</strong>
          <p>{text}</p>
        </div>
      ))}
    </div>
  </div>
);

const previewFor = {
  dashboard: <DashboardPreview />,
  backend: <BackendPreview />,
  pipeline: <PipelinePreview />,
};

function SoftwareSection({ copy }) {
  const [activeId, setActiveId] = useState(softwareViews[0].id);
  const activeView = useMemo(
    () => softwareViews.find((view) => view.id === activeId) || softwareViews[0],
    [activeId]
  );

  return (
    <section className="section software-section" id="software">
      <div className="container">
        <div className="software-section__header">
          <h2 className="section__title">{copy.title}</h2>
          <p className="section__subtitle">{copy.subtitle}</p>
        </div>

        <div className="software-tabs" role="tablist" aria-label="Software detail views">
          {softwareViews.map((view) => (
            <button
              key={view.id}
              className={`software-tab${view.id === activeId ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={view.id === activeId}
              onClick={() => setActiveId(view.id)}
            >
              <Icon name={view.id} />
              <span>{view.label}</span>
            </button>
          ))}
        </div>

        <div className="software-detail-grid">
          <div className="software-preview-column">
            {previewFor[activeView.id]}
            <div className="software-stats">
              {activeView.stats.map((stat) => (
                <div className="software-stat" key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="software-copy-column">
            <p className="software-copy__eyebrow">{activeView.eyebrow}</p>
            <h3>{activeView.title}</h3>
            <p>{activeView.text}</p>

            <ul className="software-feature-list">
              {activeView.features.map((feature) => (
                <li key={feature.title}>
                  <span className="software-feature-list__icon">
                    <Icon name="check" />
                  </span>
                  <span>
                    <strong>{feature.title}</strong>
                    <em>{feature.text}</em>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="software-tech-grid">
          {softwareTechCards.map((card) => (
            <article className={`software-tech-card software-tech-card--${card.tone}`} key={card.title}>
              <span className="software-tech-card__logos" aria-hidden="true">
                {card.logos.map((logo) =>
                  logo.src ? (
                    <img key={logo.alt} src={logo.src} alt="" loading="lazy" />
                  ) : (
                    <span className="software-tech-card__fallback" key={logo.alt}>
                      {logo.label}
                    </span>
                  )
                )}
              </span>
              <div>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default SoftwareSection;
