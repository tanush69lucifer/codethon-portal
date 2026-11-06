import { memo } from 'react';

/**
 * GenzisLoader — spectrum brand loader: the Genzis spectrum logo, a drifting
 * colour field, floating pixel squares and a spectrum progress bar.
 * Props are kept from the previous loader so every caller works unchanged
 * (`animation` is accepted but no longer used).
 */
export const GenzisLoader = memo(function GenzisLoader({ fullPage = true, label = 'Loading portal', width }) {
  const logoWidth = width || (fullPage ? 360 : 220);

  const content = (
    <div className="gz-load" style={{ '--gz-w': typeof logoWidth === 'number' ? `${logoWidth}px` : logoWidth }}>
      <div className="gz-load-mark" aria-hidden="true">
        <span className="gz-load-px a" />
        <span className="gz-load-px b" />
        <span className="gz-load-px c" />
        <img src="/genzis-spectrum.webp" alt="" draggable={false} />
      </div>
      <div className="gz-load-bar" aria-hidden="true">
        <div />
      </div>
      {label && <div className="gz-load-label">{label}</div>}
    </div>
  );

  if (!fullPage) {
    return (
      <div className="gz-load-inline" role="status" aria-live="polite">
        {content}
      </div>
    );
  }

  return (
    <div className="gz-load-page" role="status" aria-live="polite">
      <div className="gz-load-field" aria-hidden="true">
        <i className="a" />
        <i className="b" />
        <i className="c" />
      </div>
      {content}
    </div>
  );
});

export default GenzisLoader;
