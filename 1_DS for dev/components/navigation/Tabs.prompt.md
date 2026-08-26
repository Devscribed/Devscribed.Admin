# Tabs

Bottom-underline tabs, spaced 26px apart. 3px violet underline on the active tab, subtle 1.5px paper divider under the strip.

```jsx
<Tabs items={['About','Vacation']} value={tab} onChange={setTab} />
```

## Disabled placeholder tabs

Pass an object item with `disabled: true` for a non-interactive placeholder — greyed
label (`--text-faint`), no underline, no click, and it never fires `onChange`. Add
`testId` to carry a `data-testid` on the tab's own element (added for spec 05's member
detail screen, which needs Projects/Roles/Payments visible-but-inert alongside About):

```jsx
<Tabs
  value="about"
  items={[
    { value: 'about', label: 'About', testId: 'member-detail-tab-about' },
    { value: 'projects', label: 'Projects', disabled: true, testId: 'member-detail-tab-projects' },
  ]}
/>
```
