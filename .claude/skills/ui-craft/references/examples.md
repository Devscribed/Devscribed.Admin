# Worked examples

One pair per rule that is easy to read past. The wrong shape is the one that passes review by
looking careful.

---

## UC-01 — the flag is cleared in `finally`

**Wrong.** Every path clears it today.

```tsx
setSubmitting(true);
try {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin' });
  if (response.ok) {
    setSubmitting(false);
    onSaved();
    return;
  }
  setErrors(await response.json());
} catch {
  setFormError(MESSAGES.genericError);
}
setSubmitting(false);
```

The defect is not in this code; it is in the next edit. A guard added at the top of the `try` —
*if the name is unchanged, close without saving* — returns past the reset, and the submit button
stays disabled until the modal is destroyed. Nothing throws and no test fails.

**Right.**

```tsx
setSubmitting(true);
try {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin' });
  if (response.ok) return void onSaved();
  setErrors(await response.json());
} catch {
  setFormError(MESSAGES.genericError);
} finally {
  setSubmitting(false);
}
```

One reset, on the path every path goes through.

---

## UC-04, UC-06 — a catalogue that failed to load is not an empty catalogue

**Wrong.** Two real effects, in the shape they are usually written.

```tsx
useEffect(() => {
  let cancelled = false;
  void (async () => {
    const response = await fetch(`/api/organizations/${orgId}/projects?status=active`, {
      credentials: 'same-origin',
    });
    if (!response.ok || cancelled) return;
    const body = (await response.json()) as ProjectsResponse;
    if (cancelled) return;
    setProjects(body.projects.map((p) => ({ id: p.id, label: p.name })));
  })();
  return () => { cancelled = true; };
}, [orgId]);
```

Two paths hang. A network failure rejects the promise inside `void (…)()`, which nothing awaits,
so the rejection reaches no handler. A `500` takes the `!response.ok` branch and returns. Both
leave the picker drawing an empty list — and an empty list is the same picture as *this
organization has no projects*. The person sees a working control that offers nothing, with no
message, and no reason to press anything twice.

**Right.** The failure is a state the control has.

```tsx
useEffect(() => {
  const controller = new AbortController();
  void (async () => {
    try {
      const response = await fetch(`/api/organizations/${orgId}/projects?status=active`, {
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) return setProjectsState({ status: 'failed' });
      const body = (await response.json()) as ProjectsResponse;
      setProjectsState({ status: 'ready', options: body.projects.map(toOption) });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setProjectsState({ status: 'failed' });
    }
  })();
  return () => controller.abort();
}, [orgId]);
```

`failed` is drawn: the picker carries the shared failure message and the control that retries.
Three states, and the screen can tell *empty* from *unknown*.

---

## UC-14 — DOM order is reading order

**Wrong.** The key is drawn under the figures by moving it in CSS.

```tsx
<section style={{ display: 'flex', flexDirection: 'column' }}>
  <Legend style={{ order: 2 }} />
  <Figures style={{ order: 1 }} />
</section>
```

The picture reads figures then key. Tab, a screen reader and `Ctrl+F` all read key then figures,
and a change to the flex direction silently reverts the picture without touching either child.

**Right.**

```tsx
<section style={{ display: 'flex', flexDirection: 'column' }}>
  <Figures />
  <Legend />
</section>
```

---

## UC-18 — animate `transform` and `opacity`

**Wrong.** A drawer that lays out the page on every frame.

```tsx
style={{ width: open ? 320 : 0, transition: 'width 0.2s ease' }}
```

Every frame changes the width of a box the rest of the page is laid out against, so the browser
lays out and paints the whole document twelve times a second while it opens.

**Right.** The box keeps its size and moves.

```tsx
style={{
  width: 320,
  transform: open ? 'translateX(0)' : 'translateX(-100%)',
  transition: 'transform 0.2s ease',
}}
```

The rectangle it is laid out in never changes, so the browser composites and nothing re-lays out.
Where the drawer must not occupy space when closed, take it out of flow — and then **UI-04**
governs what it does to an ancestor's overflow.

---

## UC-20 — a key is a stable id

**Wrong.**

```tsx
{rows.map((row, i) => <MemberRow key={i} member={row} />)}
```

Sorting the list by another column changes which member each index names. React keeps the
elements and swaps the props, so every row below the first move is re-rendered, an open menu
belongs to a different member than the one it was opened on, and a row mid-transition finishes
the transition as somebody else.

**Right.**

```tsx
{rows.map((row) => <MemberRow key={row.id} member={row} />)}
```

---

## UC-21 — an identity handed to many children is stable

**Wrong.**

```tsx
<SessionContext.Provider value={{ session, refresh }}>
```

The object is new on every render of the provider's parent, so every consumer in the application
re-renders whenever anything above it does — including the whole grid, on a keystroke in an
unrelated field.

**Right.**

```tsx
const value = useMemo(() => ({ session, refresh }), [session, refresh]);
return <SessionContext.Provider value={value}>…</SessionContext.Provider>;
```

---

## UC-22 — state derived from props is derived during render

**Wrong.**

```tsx
const [visible, setVisible] = useState<Row[]>([]);
useEffect(() => {
  setVisible(rows.filter((r) => r.status === filter));
}, [rows, filter]);
```

Two renders for every change, and between them the screen draws the previous filter's rows under
the new filter's label — the shape **UI-07** exists to forbid, arrived at through a hook rather
than through two sources.

**Right.**

```tsx
const visible = useMemo(() => rows.filter((r) => r.status === filter), [rows, filter]);
```

---

## UC-26 — reduced motion removes the movement, not the change

**Wrong.** The panel never opens for anybody who asked for less motion.

```css
@media (prefers-reduced-motion: reduce) {
  .drawer { animation: none; transform: translateX(-100%); }
}
```

**Right.** It arrives instead of travelling.

```css
@media (prefers-reduced-motion: reduce) {
  .drawer { transition-duration: 0.01ms; }
}
```
