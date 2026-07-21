# Button

The Meridian action button. Use for CTAs, form submits, and dialog actions. `primary` is the violet action carried on a 2px lip that shrinks on press.

```jsx
<Button variant="primary">Add time</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="danger">Delete</Button>
<Button variant="primary" loading>Create account</Button>
```

Variants: `primary` · `secondary` · `ghost` · `danger`. Sizes: `sm` (36) · `md` (44, default) · `lg` (46). Pass `glow` for a dark-surface hero button, `loading` while a submit is in flight — the lip drops, a spinner leads the label, and the click is blocked.
