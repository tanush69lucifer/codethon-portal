// Decorative pieces from the Genzis spectrum identity. All purely visual (aria-hidden).

export const LOGO_SRC = '/genzis-spectrum.webp';

/** Shared SVG filter defs — render once per page that uses <IrField />. */
export function SpectrumDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <filter id="czwarp">
        <feTurbulence type="turbulence" baseFrequency="0.012" numOctaves="3" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="90" />
      </filter>
      <filter id="rsgrain">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="4" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 -1.6 1.15" />
      </filter>
    </svg>
  );
}

/** Drifting "infrared" colour field behind hero areas. */
export function IrField({ style, className = '' }) {
  return (
    <div className={`cz-ir ${className}`} style={style} aria-hidden="true">
      <i className="a" />
      <i className="b" />
      <i className="c" />
      <i className="d" />
    </div>
  );
}

/** Spectrum ribbon strokes that draw themselves in. */
export function Ribbon({ style }) {
  return (
    <svg className="cz-ribbon" viewBox="0 0 900 600" preserveAspectRatio="xMidYMid slice" style={style} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="czrg" x1="0" x2="1">
          <stop offset="0" stopColor="#FFC83D" />
          <stop offset=".25" stopColor="#FF6A1F" />
          <stop offset=".45" stopColor="#FF3FA4" />
          <stop offset=".65" stopColor="#9D6BFF" />
          <stop offset=".85" stopColor="#2EC8FF" />
          <stop offset="1" stopColor="#8CFF3A" />
        </linearGradient>
      </defs>
      <path d="M-40 150 C 180 60, 420 50, 620 100 S 900 170, 980 60" stroke="url(#czrg)" strokeWidth="26" />
      <path d="M-40 190 C 200 110, 430 100, 640 140 S 900 210, 980 110" stroke="url(#czrg)" strokeWidth="9" opacity=".7" />
      <path d="M-40 222 C 220 160, 450 150, 660 180 S 900 240, 980 160" stroke="url(#czrg)" strokeWidth="3" opacity=".6" />
    </svg>
  );
}

/** Floating pixel squares taken from the logo. */
export function Pixels() {
  const px = [
    { left: '7%', top: '20%' },
    { left: '11%', top: '15%', width: 9, height: 9, animationDelay: '-1.4s' },
    { left: '4%', top: '13%', width: 16, height: 16, animationDelay: '-3s' },
    { left: '14%', top: '22%', width: 7, height: 7, animationDelay: '-2.2s' },
  ];
  return px.map((s, i) => <span key={i} className="cz-px" style={s} aria-hidden="true" />);
}

/** Riso paper decoration for the MCQ section. */
export function RisoDecor() {
  return (
    <>
      <span className="cz-riso-sweep" aria-hidden="true" />
      <svg className="cz-riso-grain" aria-hidden="true" focusable="false">
        <rect width="100%" height="100%" filter="url(#rsgrain)" />
      </svg>
      <span className="cz-riso-deco a" aria-hidden="true" />
      <span className="cz-riso-deco b cz-halftone" aria-hidden="true" />
      <span className="cz-riso-deco c" aria-hidden="true" />
    </>
  );
}

/** CRT overlays for the coding section. */
export function CrtDecor() {
  return (
    <>
      <div className="cz-crt-scan" aria-hidden="true" />
      <div className="cz-crt-roll" aria-hidden="true" />
      <div className="cz-crt-vig" aria-hidden="true" />
    </>
  );
}

/** Genzis spectrum logo + CODEZIS wordmark, used in candidate headers. */
export function SpectrumBrand({ sub = 'Codezis' }) {
  return (
    <span className="cz-sbrand">
      <img src={LOGO_SRC} alt="Genzis" className="cz-logo" />
      <span className="cz-sbrand-div" aria-hidden="true" />
      <span className="cz-sbrand-word">{sub}</span>
    </span>
  );
}
