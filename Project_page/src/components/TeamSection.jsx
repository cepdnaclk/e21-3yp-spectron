import TeamCard from "./TeamCard.jsx";
import "../styles/team.css";

function TeamSection({ copy, members }) {
  return (
    <section className="section section--surface team-section" id="team">
      <div className="container">
        <h2 className="section__title">{copy.title}</h2>
        <p className="section__subtitle">{copy.subtitle}</p>

        <div className="team-grid">
          {members.map((member) => (
            <TeamCard
              key={member.id}
              member={member}
              portfolioLabel={copy.portfolioLabel}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default TeamSection;
