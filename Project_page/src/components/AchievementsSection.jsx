import { useState } from "react";
import "../styles/achievements.css";

const imageBase = `${import.meta.env.BASE_URL}achievements/`;
const achievements = [
  {
    id: "competition-finalist",
    title: "Competition Finalist",
    result: "Finalist",
    paragraphs: [
      "SPECTRON was selected as a finalist in our first competition.",
      "We presented and demonstrated our project to the judging panel.",
    ],
    // Add the first competition's photo here when it is supplied.
    photos: [],
  },
  {
    id: "runner-up",
    title: "1st Runner-Up",
    result: "1st Runner-Up",
    paragraphs: [
      "SPECTRON achieved 1st Runner-Up in our second competition.",
      "This was an important milestone for our team.",
    ],
    photos: [
      {
        file: "runner-up.jpeg",
        alt: "INNOVEXA 2026 announcement celebrating Team SPECTRON as 1st Runner-Up",
      },
    ],
  },
  {
    id: "netx-finalist",
    title: "NetX Competition – Finalist",
    result: "Finalist",
    paragraphs: [
      "SPECTRON was selected as a finalist in the NetX Competition organized by the University of Sri Jayewardenepura.",
      "We presented and demonstrated our SPECTRON project during the competition.",
    ],
    photos: [
      { file: "netx-team.jpeg", alt: "SPECTRON team with their project at the NetX Competition" },
      { file: "netx-demo.jpeg", alt: "SPECTRON team demonstrating their sensor hardware to the NetX judging panel" },
      { file: "netx-presentation.jpeg", alt: "SPECTRON team seated with their laptops and project hardware at NetX" },
    ],
  },
];

function AchievementCard({ achievement }) {
  const [activePhoto, setActivePhoto] = useState(0);
  const photo = achievement.photos[activePhoto];

  return (
    <article className="achievement-card" aria-labelledby={`${achievement.id}-title`}>
      <div className="achievement-card__media">
        {photo ? (
          <a
            className="achievement-card__photo-link"
            href={`${imageBase}${photo.file}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open full-size photo: ${photo.alt} (new tab)`}
          >
            <img src={`${imageBase}${photo.file}`} alt={photo.alt} loading="lazy" decoding="async" />
          </a>
        ) : (
          <div className="achievement-card__placeholder">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 7h18v12a9 9 0 0 1-18 0V7ZM15 11H8v5a8 8 0 0 0 8 8M33 11h7v5a8 8 0 0 1-8 8M24 28v9M16 41v-4h16v4" />
            </svg>
            <span>Competition photo coming soon</span>
          </div>
        )}
      </div>
      {achievement.photos.length > 1 && (
        <div className="achievement-card__gallery" role="group" aria-label={`${achievement.title} photos`}>
          {achievement.photos.map((item, index) => (
            <button
              key={item.file}
              type="button"
              className="achievement-card__thumbnail"
              aria-label={`Show photo ${index + 1}: ${item.alt}`}
              aria-pressed={activePhoto === index}
              onClick={() => setActivePhoto(index)}
            >
              <img src={`${imageBase}${item.file}`} alt="" loading="lazy" decoding="async" width="1290" height="860" />
            </button>
          ))}
        </div>
      )}
      <div className="achievement-card__content">
        <span className="achievement-card__badge">{achievement.result}</span>
        <h3 id={`${achievement.id}-title`}>{achievement.title}</h3>
        {achievement.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </article>
  );
}

export default function AchievementsSection() {
  return (
    <section className="section achievements-section" id="achievements" aria-labelledby="achievements-title">
      <div className="container">
        <h2 className="section__title" id="achievements-title">Our Achievements</h2>
        <div className="achievements-grid">
          {achievements.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} />)}
        </div>
      </div>
    </section>
  );
}
