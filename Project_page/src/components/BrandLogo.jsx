function BrandLogo({ className = "", as: Component = "span" }) {
  const classes = ["brand-logo", className].filter(Boolean).join(" ");
  const logoSrc = `${import.meta.env.BASE_URL}team/spectron-logo.svg`;

  return (
    <Component className={classes} aria-label="Spectron Modular IoT Adapter Kit">
      <span className="brand-logo__mark" aria-hidden="true">
        <img
          className="brand-logo__mark-img"
          src={logoSrc}
          alt=""
        />
      </span>
      <span className="brand-logo__copy">
        <span className="brand-logo__name">SPECTRON</span>
        <span className="brand-logo__tagline">Modular IoT Adapter Kit</span>
      </span>
    </Component>
  );
}

export default BrandLogo;
