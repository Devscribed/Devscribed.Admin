# Spinner

Rotating arc for in-flight work. Inherits `currentColor`; never carries its own
accessible name — pair it with visible copy, or with `aria-busy` on the container.

```jsx
<Spinner />                                  {/* 15px — what <Button loading> renders */}
<Spinner size={28} style={{ color: 'var(--accent)' }} />
```

`Button` uses this internally for its `loading` state. Reach for `Spinner`
directly only when the wait belongs to a region rather than to a control —
a card validating a token, a panel loading rows.
