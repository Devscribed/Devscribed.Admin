# Worked examples

One per invariant: the shape that is wrong, the shape that is right, and the sentence a
document writes so the wrong one is refused before it is built.

Read these for the **mechanism**. Each has been found on several controls; a fix written for
the control it was found on leaves the mechanism live everywhere else.

---

## UI-01 — a box sized by its content

### The shape

```tsx
/* wrong — the control is as wide as whatever is selected in it */
<Select options={COUNTRY_OPTIONS} />
```

```tsx
/* right — the control is a box, and the value is what varies inside it */
<Select options={COUNTRY_OPTIONS} style={{ width: 'var(--field-width-m)' }} />
```

### Three disguises it wears

**A value that is longer.** A picker whose width follows its selection moves everything in its
row when the selection changes.

**A count that is larger.** A multi-select drawing one chip per choice is as tall as the
selection. The fix is not "make two chips fit" — that moves the jump from the second choice to
the third. The selection is stated on one line (`Poland +2`) and the control's height stops
being a function of the count.

**A value that is absent.** A row whose second line is a job title is one line shorter for the
member who has none. Presence varies exactly like length does.

### `min-` is not a reservation

```tsx
/* wrong — holds until the content exceeds it, which is when it was needed */
{ minWidth: 220, minHeight: 20 }

/* right */
{ width: 260, height: 20, whiteSpace: 'nowrap' }
```

A `min-height` on a slot whose line can wrap is not a reservation: a line too wide for its box
wraps, and takes the height with it. Reserve the height **and** stop the wrap.

### What the spec writes

> | `holidays-sourcing-panel` | a status line present or absent, two possible strings | a fixed width sized for the longer string, and a status slot of one fixed line that does not wrap | the Refresh button, sideways, whenever a sync starts or ends |

---

## UI-02 — a control that moves because it was used

### The shape

```tsx
/* wrong — the label is the last child of a row pinned to the right edge, and has no width.
   Every character it gains is taken from the space where the arrows are standing. */
<PageHeader action={
  <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
    <IconButton data-testid="calendar-prev" />
    <Button data-testid="calendar-today">Today</Button>
    <IconButton data-testid="calendar-next" />
    <span data-testid="calendar-range-label">{label}</span>
  </div>
} />
```

The reader presses `›`, the label goes from `March 2027` to `28 Sep – 11 Oct 2026`, and the
arrow they just clicked is no longer under the pointer. The second click lands on Today.

```tsx
/* right — the label absorbs its own variation */
<span data-testid="calendar-range-label"
      style={{ width: 'var(--range-col)', textAlign: 'center' }}>{label}</span>
```

### The test that catches it

Position, not appearance:

```ts
const box = await page.getByTestId('calendar-next').boundingBox();
await page.getByTestId('calendar-next').click();
await expect(page.getByTestId('calendar-range-label')).not.toHaveText(before);
expect(await page.getByTestId('calendar-next').boundingBox()).toEqual(box);
```

---

## UI-03 — the wait drawn over something worth keeping

### The shape

```tsx
/* wrong — one flag for every read, so a re-read of the same question blanks the screen */
if (loading) return <Skeleton />;
return <Table rows={rows} />;
```

Pressing Refresh, ticking a box, saving a row — each throws the table away and rebuilds it in
front of the person who asked for one row to change.

```tsx
/* wrong in the other direction — content outlives its question */
if (scope === 'teams' && projectIds.length === 0) { setError(teamsRequired); return; }
// `data` still holds the last window that answered 200, and the header has already moved
```

```tsx
/* right — the state is a property of what is in hand, not of the caller */
if (!rows) return <Skeleton />;          // nothing to draw
return <Table rows={rows} aria-busy={loading} />;   // an answer, possibly being replaced
```

And a question that is withdrawn clears what answered it, rather than leaving it under a banner.

### Why an option on the call site is the wrong shape

Passing `{ quiet: true }` at some call sites and not others makes "draw a wait" a property of
who asked. It is a property of **what is in hand**. Every call site that is later added gets
the default, and the default is wrong half the time.

### What the spec writes

The question, once, then every state of it — including which question the kept content still
answers.

---

## UI-04 — a box outside its flow that is still in the layout

### Three mechanisms, one invariant

**Absolute inside a scroller.** An absolutely positioned box counts toward the scrollable
overflow of the nearest scrolling ancestor. A `Select` that renders its open list inside its
own wrapper, placed in a `Modal` panel that is its own scroller, adds the list's height to the
panel's `scrollHeight` the moment it opens — the panel grows a scrollbar and clips the list it
just opened.

```tsx
/* right — the bubble is portalled and positioned against the trigger's rectangle */
createPortal(<ul style={{ position: 'fixed', ...rectOf(trigger) }} />, document.body)
```

**Transform inside a scroller.** A transformed box contributes its **transformed** rectangle to
its scroller's overflow. A grid nudged 16px right to animate in makes the scroller 16px wider
than its content for the length of the animation, and a horizontal scrollbar appears and
vanishes on every press.

```css
/* wrong */ transform: translateX(16px);
/* right */ clip-path: inset(0 0 0 16px);   /* grows from the edge; never wider than where it settles */
```

**A slot hanging below its wrapper.** A message slot positioned `bottom: -20px` contributes no
height to its wrapper. Whatever is placed under that wrapper must leave 20px, and the number
that says so lives in a different file. Either the slot takes its own height, or the gap below
it is derived from the same token.

### The test that catches it

```ts
const panel = page.getByTestId('holiday-modal-panel');
const closed = await panel.evaluate((el) => el.scrollHeight);
await page.getByTestId('holiday-country-select').click();
expect(await panel.evaluate((el) => el.scrollHeight)).toBeLessThanOrEqual(closed);
```

---

## UI-05 — one message drawn twice

### The shape

```tsx
/* wrong — the message is handed to the component AND drawn beside it */
<Input label="Title" error={errors.title} data-testid="request-new-title" />
{errors.title && <div data-testid="request-new-error-title">{errors.title}</div>}
```

The screen prints "Enter a title" twice, on two lines, both in the error colour.

```tsx
/* right — the component owns the slot; the id goes where the component puts it */
<Input label="Title" error={errors.title} data-testid="request-new-title"
       errorTestId="request-new-error-title" />
```

### Why the suite never sees it

The assertion selects `request-new-error-title`, and only **one** of the two nodes carries that
id. Every id-based assertion passes while the screen is visibly wrong.

```ts
/* wrong — passes with two nodes on screen */
await expect(page.getByTestId('request-new-error-title')).toBeVisible();

/* right — the message, not the id, and exactly once */
await expectMessageOnce(page.getByTestId('request-new-modal'), REQUEST_MESSAGES.titleRequired);
```

**Rule: a `data-testid` proves presence, never uniqueness.** Any assertion about user-facing
text is a count.

---

## UI-06 — a token that names an asset nothing loads

### The shape

```css
/* tokens/typography.css */
--font-family-base: 'Poppins', sans-serif;
--font-weight-medium: 500;
```

…and no `@font-face`, no `next/font`, no `<link>` anywhere in the product. A machine with the
family installed draws the product as designed; one without draws its generic sans, and nobody
can tell which they are looking at.

**The second half is the one that is missed.** A family that does not cover a script the data
carries falls through **per glyph** to whatever the browser picks next — and if that fallback
has no 500 weight, a request for `--font-weight-medium` resolves *down* to 400. Two names in one
list, one medium and one not, with nothing but their alphabet between them.

```
right: the family is loaded, in every weight the tokens ask for, with a declared fallback that
       covers every script the product's own data can hold.
```

### What the gate checks

`static-gate` reads every `--font-family-*` token and asks whether anything in the tree loads
each family named in it. Nothing loading it is a blocker, not a note: the product is drawn in a
typeface nobody chose.

---

## UI-07 — one value, two sources

### The shape

```tsx
/* wrong — the label comes from the client, the grid comes from the server */
const range = useMemo(() => windowFor(anchor), [anchor]);        // client
const days  = data?.days;                                        // server
```

They disagree the moment the fetch is refused, is slow, or fails: the header claims one window
and the grid shows another, with nothing on the page saying which is real.

```tsx
/* wrong — two clocks */
const today = new Date();                        // the browser's local clock
// ...while the today marker in the grid comes from the server's Account.timezone
```

```
right: one source, named in the spec. Where the client must derive a value, the spec says the
       server's answer governs and what is drawn while the two could disagree.
```

---

## UI-08 — a list with no way through it

### The shape

A picker with 250 rows and no search: choosing Poland means dragging past two hundred names.

A multi-select that hides what is already chosen: tick every option and the menu says `No
options`, and the only way to untick anything is to find its chip's cross.

```
right: a list states its length and the way through it. Past the length a person will scroll,
       the way through is typing. The list of what can be chosen and the list of what has been
       chosen are one list, and it is shown whole.
```

### What the spec writes

> | Borrowed | What it demands of the caller | How this spec meets it |
> | `Select`, country options | 250 rows; past ~20 a list needs a way through it other than the wheel | `isSearchable`, filtering case-insensitively on any part of the label |
