import React from 'react';

/* components/shared/Preloader is NOT a spinner: it portals react-spinners' PulseLoader
   (color #0168fa, size 12, margin 7, speedMultiplier 1) into #portal and centres it with
   .overlay{position:absolute; top/left:50%; translate(-50%,-50%); z-index:1002}.
   The infinite-scroll tables render the same loader inline at size 8 / margin 5
   (ProjectsTable.tsx, ToDosTable.tsx, ClientsTable.tsx → .loadNextTableIndicator, centeredFlex).
   Animation read from node_modules/react-spinners@0.13.6/PulseLoader.js: three inline-block
   spans, borderRadius 100%, animation `${0.75 / speedMultiplier}s ${(i * 0.12) / speedMultiplier}s
   infinite cubic-bezier(0.2, 0.68, 0.18, 1.08)` with i = 1, 2, 3 (so the delays are .12/.24/.36s),
   animation-fill-mode both, and a wrapper span at `display: inherit`. */
const kf = `@keyframes ds-pulse-loader {
  0% { transform: scale(1); opacity: 1; }
  45% { transform: scale(0.1); opacity: 0.7; }
  80% { transform: scale(1); opacity: 1; }
}`;

/* Injected once into <head>, not rendered as a sibling: a sibling <style> is a real element
   and breaks a consumer's adjacent-sibling rules and :nth-child counts. */
if (typeof document !== 'undefined' && !document.getElementById('ds-pulse-loader-style')) {
  const el = document.createElement('style');
  el.id = 'ds-pulse-loader-style';
  el.textContent = kf;
  document.head.appendChild(el);
}

export function Preloader({
  size = 12, margin = 7, overlay = false, speedMultiplier = 1,
  /* §23 — blue forwards nothing, so `data-testid`, `role="status"` and `aria-label` never
     reached the DOM. Prod portals this into #portal and nothing has to find it; a loader that
     stands in for a screen's content has to be both findable and announceable. */
  style, ...rest
}) {
  return (
    <span
      {...rest}
      style={{
        ...(overlay
          ? { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }
          : { display: 'inherit' }),
        ...style,
      }}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            display: 'inline-block', backgroundColor: '#0168fa', width: size, height: size,
            margin, borderRadius: '100%',
            animation: `ds-pulse-loader ${0.75 / speedMultiplier}s ${(i * 0.12) / speedMultiplier}s infinite cubic-bezier(0.2, 0.68, 0.18, 1.08)`,
            animationFillMode: 'both',
          }}
        />
      ))}
    </span>
  );
}
