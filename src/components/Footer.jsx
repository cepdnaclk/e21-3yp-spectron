import "../styles/footer.css";

const quickLinkIds = ["home", "overview", "architecture", "tech", "team"];

const IconLocation = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 2.5a7 7 0 0 0-7 7c0 5.25 7 12 7 12s7-6.75 7-12a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
  </svg>
);

const IconMail = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4.75 5h14.5A2.25 2.25 0 0 1 21.5 7.25v9.5A2.25 2.25 0 0 1 19.25 19H4.75A2.25 2.25 0 0 1 2.5 16.75v-9.5A2.25 2.25 0 0 1 4.75 5zm0 1.5a.75.75 0 0 0-.46 1.34l6.73 5.38a1.5 1.5 0 0 0 1.89 0l6.73-5.38a.75.75 0 0 0-.46-1.34H4.75z" />
  </svg>
);

function Footer({ copy, nav }) {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <h2>{copy.brand}</h2>
          <p>{copy.tagline}</p>
        </div>

        <div className="footer-links">
          <h3>{copy.quickLinksTitle}</h3>
          <ul>
            {quickLinkIds.map((id) => (
              <li key={id}>
                <a href={`#${id}`}>{nav[id]}</a>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer-contact">
          <h3>{copy.contactTitle}</h3>
          <div className="footer-contact__item">
            <span className="footer-icon">
              <IconLocation />
            </span>
            <p>{copy.contact.address}</p>
          </div>
          <div className="footer-contact__item">
            <span className="footer-icon">
              <IconMail />
            </span>
            <a href={`mailto:${copy.contact.email}`}>{copy.contact.email}</a>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>{copy.copyright}</p>
      </div>
    </footer>
  );
}

export default Footer;
