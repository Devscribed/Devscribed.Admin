One-of-many selection. Use `RadioGroup` for a bound set; use `Radio` alone only for custom layouts.

```jsx
<RadioGroup
  value={mode}
  onChange={setMode}
  options={[{ value: 'auto', label: 'Automatic' }, { value: 'manual', label: 'Manual' }]}
/>
```

Variants: `direction="row"` for inline; per-option `disabled` via `{ value, label, disabled: true }`; whole-group `disabled`.
