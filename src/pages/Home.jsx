import { useState } from "react";
import ArchitectureDiagram from "../components/ArchitectureDiagram.jsx";
import ExplanationPanel from "../components/ExplanationPanel.jsx";
import TeamSection from "../components/TeamSection.jsx";
import Footer from "../components/Footer.jsx";
import { architectureFlow, architectureScenarios } from "../data/architectureData.js";
import { teamMembers } from "../data/teamData.js";

function Home({ copy }) {
  const [activeItem, setActiveItem] = useState(null);

  const handleSelect = (type, item) => {
    // Clicking the same item twice clears the explanation panel.
    setActiveItem((prev) => {
      if (prev && prev.id === item.id && prev.type === type) {
        return null;
      }

      return { ...item, type };
    });
  };

  const handleReset = () => setActiveItem(null);

  return (
    <>
      <main>
        <section className="section hero-section" id="home">
          <div className="container hero">
            <div className="hero__content">
              <p className="eyebrow">{copy.hero.eyebrow}</p>
              <h1 className="hero__title">{copy.hero.title}</h1>
              <p className="hero__text">{copy.hero.text}</p>
              <div className="hero__actions">
                <a className="btn btn--primary" href="#team">
                  {copy.hero.primaryCta}
                </a>
                <a className="btn btn--ghost" href="#overview">
                  {copy.hero.secondaryCta}
                </a>
              </div>
            </div>
            <div className="hero__card">
              <h2 className="card__title">{copy.hero.highlightsTitle}</h2>
              <ul className="hero__list">
                {copy.hero.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="section section--surface" id="overview">
          <div className="container">
            <h2 className="section__title">{copy.overview.title}</h2>
            <p className="section__subtitle">{copy.overview.subtitle}</p>
            <div className="info-grid">
              {copy.overview.cards.map((card) => (
                <article className="info-card" key={card.title}>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section architecture-section" id="architecture">
          <div className="container">
            <h2 className="section__title">{copy.architecture.title}</h2>
            <p className="section__subtitle">{copy.architecture.subtitle}</p>
            <div className="architecture-grid">
              <ArchitectureDiagram
                scenarios={architectureScenarios}
                flow={architectureFlow}
                activeItem={activeItem}
                onSelect={handleSelect}
                copy={copy.architecture}
              />
              <ExplanationPanel
                activeItem={activeItem}
                copy={copy.architecture}
                onReset={handleReset}
              />
            </div>
          </div>
        </section>

        <section className="section" id="tech">
          <div className="container">
            <h2 className="section__title">{copy.tech.title}</h2>
            <p className="section__subtitle">{copy.tech.subtitle}</p>
            <div className="tech-list">
              {copy.tech.pills.map((pill) => (
                <span className="tech-pill" key={pill}>
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </section>

        <TeamSection copy={copy.team} members={teamMembers} />
      </main>
      <Footer copy={copy.footer} nav={copy.nav} />
    </>
  );
}

export default Home;
