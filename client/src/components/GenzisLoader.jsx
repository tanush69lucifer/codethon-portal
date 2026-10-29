import { memo } from 'react';

/**
 * GenzisLoader
 * Renders the official Genzis brand loader with the authentic artwork and
 * the letter 'Z' rotating with subpixel perfection right in its designated slot.
 */
export const GenzisLoader = memo(function GenzisLoader({
  fullPage = true,
  label = 'Loading Portal',
  animation = 'spin',
  width,
}) {
  const badgeWidth = width || (fullPage ? 340 : 260);

  const content = (
    <div
      className="genzis-widget"
      style={{ width: typeof badgeWidth === 'number' ? `${badgeWidth}px` : badgeWidth }}
    >
      <div className="genzis-card" aria-hidden="true">
        <img
          src="/genzis-base-hd.png"
          alt="GENZIS - Generations Ahead"
          className="genzis-base-img"
          draggable={false}
        />
        <img
          src="/genzis-z-hd.png"
          alt="Z"
          className={`genzis-z-img genzis-anim-${animation}`}
          draggable={false}
        />
      </div>

      <div className="genzis-progress-track" aria-hidden="true">
        <div className="genzis-progress-bar" />
      </div>

      {label && <div className="genzis-label">{label}</div>}
    </div>
  );

  if (!fullPage) {
    return <div className="genzis-inline-wrap">{content}</div>;
  }

  return (
    <div className="genzis-fullpage-overlay" role="status" aria-live="polite">
      {content}
    </div>
  );
});

export default GenzisLoader;
