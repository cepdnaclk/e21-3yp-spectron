const IconLinkedIn = ({ title }) => (
  <svg
    aria-hidden={title ? undefined : true}
    viewBox="0 0 24 24"
    role={title ? "img" : "presentation"}
    focusable="false"
  >
    {title ? <title>{title}</title> : null}
    <path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM.5 8.5h4.96V24H.5zM8.5 8.5h4.75v2.11h.07c.66-1.25 2.28-2.57 4.69-2.57 5.02 0 5.94 3.3 5.94 7.59V24h-4.96v-6.82c0-1.62-.03-3.7-2.26-3.7-2.26 0-2.61 1.77-2.61 3.59V24H8.5z" />
  </svg>
);

const IconGitHub = ({ title }) => (
  <svg
    aria-hidden={title ? undefined : true}
    viewBox="0 0 24 24"
    role={title ? "img" : "presentation"}
    focusable="false"
  >
    {title ? <title>{title}</title> : null}
    <path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.2c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.35-1.76-1.35-1.76-1.1-.76.08-.74.08-.74 1.22.09 1.86 1.25 1.86 1.25 1.08 1.86 2.84 1.32 3.54 1.01.11-.79.42-1.32.77-1.62-2.67-.31-5.47-1.34-5.47-5.96 0-1.31.47-2.38 1.24-3.22-.12-.31-.54-1.56.12-3.25 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.69.24 2.94.12 3.25.77.84 1.24 1.91 1.24 3.22 0 4.63-2.81 5.65-5.49 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12 12 0 0 0 12 .5z" />
  </svg>
);

const IconMail = ({ title }) => (
  <svg
    aria-hidden={title ? undefined : true}
    viewBox="0 0 24 24"
    role={title ? "img" : "presentation"}
    focusable="false"
  >
    {title ? <title>{title}</title> : null}
    <path d="M2.5 6.75A2.25 2.25 0 0 1 4.75 4.5h14.5A2.25 2.25 0 0 1 21.5 6.75v10.5A2.25 2.25 0 0 1 19.25 19.5H4.75A2.25 2.25 0 0 1 2.5 17.25V6.75zm2.62-.75a.75.75 0 0 0-.46 1.34l6.73 5.38a1.5 1.5 0 0 0 1.89 0l6.73-5.38a.75.75 0 0 0-.46-1.34H5.12zm14.88 3.1-5.94 4.76a3 3 0 0 1-3.77 0L4.5 9.1v8.15c0 .41.34.75.75.75h13.5c.41 0 .75-.34.75-.75V9.1z" />
  </svg>
);

function TeamCard({ member, portfolioLabel }) {
  const emailHref = member.links?.email
    ? member.links.email.startsWith("mailto:")
      ? member.links.email
      : `mailto:${member.links.email}`
    : null;

  return (
    <article className="team-card">
      <img
        className="team-card__img"
        src={member.image}
        alt={`${member.name} profile photo`}
      />
      <h3 className="team-card__name">{member.name}</h3>
      <p className="team-card__reg">{member.regNo}</p>
      {member.portfolioUrl ? (
        <a
          className="team-card__portfolio"
          href={member.portfolioUrl}
          target="_blank"
          rel="noreferrer"
        >
          {portfolioLabel}
        </a>
      ) : null}
      <div className="team-card__social">
        {member.links?.github ? (
          <a
            className="social-link"
            href={member.links.github}
            target="_blank"
            rel="noreferrer"
            aria-label={`${member.name} GitHub`}
          >
            <IconGitHub />
          </a>
        ) : null}
        {member.links?.linkedin ? (
          <a
            className="social-link"
            href={member.links.linkedin}
            target="_blank"
            rel="noreferrer"
            aria-label={`${member.name} LinkedIn`}
          >
            <IconLinkedIn />
          </a>
        ) : null}
        {emailHref ? (
          <a
            className="social-link"
            href={emailHref}
            aria-label={`${member.name} Email`}
          >
            <IconMail />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default TeamCard;
