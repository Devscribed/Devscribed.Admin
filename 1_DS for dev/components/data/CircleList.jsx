import React from 'react';

/**
 * CircleList — the overlapping, individually selectable member circles from
 * components/shared/CircleList (+ CircleItem), used by Team overview's filter panel.
 * CircleItem.module.scss: .circleContainer{margin-right:-10px} (on EVERY item, including the
 * last), .circle{position:relative;36x36;border-radius:50%;background:#ccc;flex-centred;
 * font-size:17px;cursor:pointer;border:2px solid white;transition:transform .2s, z-index .2s},
 * .circle:hover{transform:scale(1.1);z-index:100}, .selected{border:2px solid #00B6FF}.
 * CircleList.tsx: maxCountCircle defaults to 5, the label is `item.label[0]` (ONE character),
 * selected items are sorted to the front, and z-index is inline — the container gets
 * `isSelected ? items.length : index`, the circle `isHovered ? 10000 : index`, so the inline
 * hover z-index outranks the stylesheet's 100.
 * No "+N" chip lives here: the grey counter circle beside the list is a separate react-select
 * control — see CircleSelect.
 */
export function CircleList({ items = [], max = 5, onChange }) {
  const [selected, setSelected] = React.useState(() => items.filter((i) => i.isSelected).map((i) => i.id));
  const [hovered, setHovered] = React.useState(null);
  const sorted = [...items].sort((a, b) => (a.isSelected && !b.isSelected ? -1 : !a.isSelected && b.isSelected ? 1 : 0));
  const toggle = (item) => {
    const next = selected.includes(item.id) ? selected.filter((id) => id !== item.id) : selected.concat([item.id]);
    setSelected(next);
    onChange && onChange(items.filter((i) => next.includes(i.id)));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'row' }}>
      {sorted.slice(0, max).map((item, index) => {
        const isSelected = selected.includes(item.id);
        const isHovered = hovered === index;
        return (
          <div
            key={item.id}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => toggle(item)}
            style={{ marginRight: -10, zIndex: isSelected ? items.length : index }}
          >
            <div
              style={{
                position: 'relative', width: 36, height: 36, borderRadius: '50%', backgroundColor: '#ccc',
                display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 17, cursor: 'pointer',
                border: isSelected ? '2px solid #00B6FF' : '2px solid white',
                transition: 'transform 0.2s, z-index 0.2s',
                transform: isHovered ? 'scale(1.1)' : undefined,
                zIndex: isHovered ? 10000 : index,
              }}
            >
              {item.label[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
