export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  dark = false,
}) {
  const isCenter = align === 'center'

  return (
    <div className={isCenter ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      {eyebrow ? (
        <p
          className={
            dark
              ? 'inline-flex items-center gap-2 rounded-md border border-teal-300/30 bg-teal-300/10 px-3 py-1 text-xs font-semibold uppercase text-teal-100'
              : 'eyebrow'
          }
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={`mt-4 text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl ${
          dark ? 'text-white' : 'text-slate-950'
        }`}
      >
        {title}
      </h2>
      {description ? (
        <p className={`mt-4 text-base leading-7 sm:text-lg ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
          {description}
        </p>
      ) : null}
    </div>
  )
}
