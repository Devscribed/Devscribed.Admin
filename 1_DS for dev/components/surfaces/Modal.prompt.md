# Modal

Dialog with a warm ink scrim, 14px radius, heavy brown-cast shadow. Title in Grotesk 600 · 20px.

```jsx
<Modal open={o} title="Add time" onClose={close}
  actions={<><Button variant="secondary">Cancel</Button><Button>Send</Button></>}>
  <Input label="Project" defaultValue="Marketing site" />
</Modal>
```

Any unrecognized prop (`data-testid`, `aria-describedby`, …) is spread onto the dialog surface itself — the panel carries `role="dialog"`/`aria-modal="true"` automatically, so a caller only needs to add `data-testid` to make the whole dialog locatable in tests (spec 04's `confirm-delete-dialog`, for instance).
