# Table

Flex-based table. Header row uses the paper-300 wash with Grotesk uppercase micro-labels; body rows tint on hover and dim (`opacity:.65`) when `dim` is true — the treatment for removed members and inactive projects.

```jsx
<Table
  columns={[
    { label: 'Member', flex: 2, key: 'name' },
    { label: 'Hours',  flex: 1, align: 'center', mono: true, key: 'hours' },
    { label: 'Status', flex: 1, align: 'center', render: r => <Badge tone={r.status}>{r.status}</Badge> },
  ]}
  rows={[{ id: 1, name: 'Alex Chen', hours: '42h 20m', status: 'active' }]}
/>
```

Pass `onRowClick` to make every row clickable — the row gets `cursor: pointer` and fires with that row's data. Give a row a `testId` to tag it with `data-testid` (spec 04's `member-row-{id}`, for instance). A cell that needs to stop a row click from firing (a menu trigger, an inline button) should call `event.stopPropagation()` inside its own `render`.

```jsx
<Table
  columns={[
    { label: 'Name', flex: 2, key: 'name' },
    { label: 'Actions', flex: 0, align: 'flex-end', render: r => (
      <div onClick={e => e.stopPropagation()}><IconButton label="Actions">{icDots}</IconButton></div>
    ) },
  ]}
  rows={people.map(p => ({ ...p, testId: `member-row-${p.id}` }))}
  onRowClick={row => router.push(`/members/${row.id}`)}
/>
```
