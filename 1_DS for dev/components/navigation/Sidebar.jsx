import React from 'react';
import {
  TimesheetsIcon, ProjectManagementIcon, PeopleIcon, ReportsIcon, TimeOffIcon, OrgIcon, MenuIcon, ArrowIcon,
} from '../icons/Icon.jsx';

function Wordmark() {
  return (
  /* TeamplayLogoIcon renders at width 185 / height 35 over a 71x15 viewBox — the default
     preserveAspectRatio letterboxes the mark to 165.6x35 inside that box (measured ink
     164x26 CSS in prod-screens/21, 2x, starting exactly at the 24px header padding). */
  <svg width="185" height="35" viewBox="0 0 71 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.744 2.6V4.292H4.404V11H2.592V4.292H0.252V2.6H6.744ZM13.2452 7.748C13.2452 7.916 13.2332 8.084 13.2092 8.252H8.30119C8.45719 9.14 9.03319 9.632 9.88519 9.632C10.4972 9.632 11.0012 9.344 11.2652 8.876H13.1012C12.6332 10.292 11.3972 11.192 9.88519 11.192C7.97719 11.192 6.52519 9.704 6.52519 7.76C6.52519 5.816 7.96519 4.34 9.88519 4.34C11.8772 4.34 13.2452 5.876 13.2452 7.748ZM9.88519 5.84C9.10519 5.84 8.55319 6.296 8.34919 7.064H11.4932C11.2412 6.272 10.6772 5.84 9.88519 5.84ZM19.7723 4.52H21.0803V11H19.7123L19.5563 10.412C19.0043 10.904 18.2843 11.192 17.4563 11.192C15.5123 11.192 14.0603 9.716 14.0603 7.76C14.0603 5.804 15.5123 4.34 17.4563 4.34C18.2963 4.34 19.0283 4.64 19.5923 5.132L19.7723 4.52ZM17.6003 9.536C18.6203 9.536 19.3643 8.78 19.3643 7.76C19.3643 6.74 18.6203 5.984 17.6003 5.984C16.5803 5.984 15.8363 6.74 15.8363 7.76C15.8363 8.768 16.5803 9.536 17.6003 9.536ZM30.1455 4.376C31.4895 4.376 32.4255 5.42 32.4255 6.944V11H30.6735V7.232C30.6735 6.368 30.3375 5.912 29.7015 5.912C28.9215 5.912 28.4535 6.488 28.4535 7.496V11H26.7495V7.232C26.7495 6.368 26.4135 5.912 25.7895 5.912C24.9975 5.912 24.5295 6.488 24.5295 7.496V11H22.7775V4.52H24.0015L24.3255 5.324C24.7815 4.748 25.4895 4.376 26.2575 4.376C27.0855 4.376 27.7575 4.76 28.1415 5.408C28.5855 4.784 29.3175 4.376 30.1455 4.376Z" fill="#007AFF" />
    <path d="M41.3952 4.388C42.7512 4.388 43.6392 5.408 43.6392 6.884V11H42.8232V7.124C42.8232 5.9 42.2232 5.132 41.2392 5.132C40.1832 5.132 39.3672 6.08 39.3552 7.352V11H38.5632V7.124C38.5632 5.888 37.9632 5.132 36.9672 5.132C35.9112 5.132 35.0952 6.08 35.0832 7.352V11H34.2672V4.52H34.8672L35.0112 5.528C35.4792 4.82 36.2592 4.388 37.1352 4.388C38.0952 4.388 38.8152 4.904 39.1512 5.732C39.6072 4.904 40.4352 4.388 41.3952 4.388ZM51.693 7.772C51.693 7.868 51.681 7.976 51.681 8.072H45.981C46.113 9.416 47.109 10.34 48.453 10.34C49.425 10.34 50.217 9.872 50.649 9.068H51.513C50.937 10.388 49.833 11.144 48.453 11.144C46.581 11.144 45.165 9.692 45.165 7.76C45.165 5.84 46.581 4.388 48.453 4.388C50.385 4.388 51.693 5.888 51.693 7.772ZM48.453 5.168C47.145 5.168 46.185 6.032 45.993 7.316H50.877C50.697 6.008 49.725 5.168 48.453 5.168ZM56.1548 4.496H56.7308V5.276H56.0948C54.8468 5.276 54.1028 6.128 54.1028 7.448V11H53.2868V4.52H53.8748L54.0188 5.636C54.4628 4.904 55.1828 4.496 56.1548 4.496ZM57.8922 11V2.216H58.7082V11H57.8922Z" fill="#151515" />
    <circle cx="64.8335" cy="7.02956" r="0.838577" fill="#151515" />
    <rect x="69.8054" y="2" width="0.940608" height="6.45195" transform="rotate(48.1411 69.8054 2)" fill="#151515" />
    <rect x="61" y="3.87146" width="0.664653" height="4.50603" transform="rotate(-45.704 61 3.87146)" fill="#151515" />
    <rect x="64.4131" y="7.45505" width="0.37302" height="5.70956" transform="rotate(18.0175 64.4131 7.45505)" fill="#151515" />
  </svg>
  );
}

/* Nav structure copied verbatim from appLayout/Sidebar.tsx */
const NAV = [
  { type: 'link', title: 'Timesheets', Icon: TimesheetsIcon },
  { type: 'submenu', title: 'Project management', Icon: ProjectManagementIcon, subs: ['ToDo / Teams', 'Projects / Teams', 'Clients'] },
  { type: 'submenu', title: 'People', Icon: PeopleIcon, subs: ['Members'] },
  { type: 'link', title: 'Team overview', Icon: OrgIcon },
  { type: 'submenu', title: 'Reports', Icon: ReportsIcon, subs: ['Time & activity', 'Amounts owed', 'Time offs', 'All reports'] },
  { type: 'submenu', title: 'Time off', Icon: TimeOffIcon, subs: ['Policies', 'Holidays', 'Requests'] },
  { type: 'submenu', title: 'Organization', Icon: OrgIcon, subs: ['My organization', 'Subscription'] },
];

/* §13 — every row in prod is a `<NavLink to=…>`, so the anchor below carries a real `href`
   when one is given and falls back to blue's own `href="#"` when it is not. `onNavigate` is
   what lets a router intercept the click while the row stays a link a reader can middle-click,
   copy the address of, or open in a new tab. */
function rowClick(href, onNavigate, onClick, title, sub) {
  return (e) => {
    if (onNavigate) {
      onNavigate(e, href);
      if (e.defaultPrevented) return;
    }
    if (!href) e.preventDefault();
    if (onClick) onClick(title, sub);
  };
}

/* SidebarLink.module.scss: .navLink{font-weight:500; color:$appGray; transition:color .3s;
   svg{margin-right:12px; fill:$appGray}} :hover{color:$appBlue; svg{fill:$appBlue;
   transition:fill .3s}} .activeClassName{color+fill:$appBlue}. Hover and active resolve to the
   same blue, so hovering the active item changes nothing. .navItem{margin-bottom:36px} */
function TopLink({ Icon, title, href, testId, active, onClick, onNavigate }) {
  const [hover, setHover] = React.useState(false);
  const color = active || hover ? 'var(--color-blue)' : 'var(--text-secondary)';
  return (
    <li style={{ marginBottom: 36 }}>
      <a href={href || '#'} onClick={rowClick(href, onNavigate, onClick, title)}
        data-testid={testId}
        /* §13 — prod marks the current row with a class only; `aria-current` is the same fact
           said where a screen reader can hear it. */
        aria-current={active ? 'page' : undefined}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'flex-start', fontFamily: 'var(--font-family-base)', fontWeight: 500, fontSize: 'var(--font-size-base)', color, transition: 'color 0.3s' }}>
        <span style={{ display: 'flex', marginRight: 12, color, transition: 'color 0.3s' }}><Icon /></span>
        <span>{title}</span>
      </a>
    </li>
  );
}

function SubItem({ label, href, testId, active, last, onClick, onNavigate, parent }) {
  const [hover, setHover] = React.useState(false);
  return (
    <li style={{ marginBottom: last ? 0 : 16 }}>
      {/* .subItemLink{padding:4px 12px; 14px/500; color:$appGray} :hover{color:$appBlue}
         .activeClassName{background:#F4F7FF; color:$appBlue} — the active row is already blue,
         so hover leaves it untouched. */}
      <a href={href || '#'} onClick={rowClick(href, onNavigate, onClick, parent, label)}
        data-testid={testId}
        aria-current={active ? 'page' : undefined}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', fontSize: 'var(--font-size-s)', fontWeight: 500, backgroundColor: active ? 'var(--color-blue-tint)' : 'transparent', color: active || hover ? 'var(--color-blue)' : 'var(--text-secondary)' }}>
        {label}
      </a>
    </li>
  );
}

function SubMenu({ Icon, title, subs, active, defaultOpen, defaultSub, onSelectSub, onNavigate }) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const [hover, setHover] = React.useState(false);
  const [clickedSub, setClickedSub] = React.useState(defaultOpen ? (defaultSub || subs[0].label) : null);
  /* §13 — prod mounts a fresh Sidebar per route, so "open" only ever had to be right once.
     Under a client router the same instance survives the navigation, and a section that has
     just become current has to open itself or its rows are unreachable without a second click.
     A section the reader closed by hand stays closed until it becomes current again. */
  React.useEffect(() => { if (active) setOpen(true); }, [active]);
  /* .subMenuTitle:hover{color:#0168fa; svg{fill:$appBlue}} beats .activeTitle{color:$appBlue}
     on specificity, so an active submenu title does shift to #0168fa on hover — the one place
     in the sidebar where the active item reacts. The icon and the arrow (also an svg inside the
     title) turn $appBlue for both states. */
  const titleColor = hover ? '#0168fa' : active ? 'var(--color-blue)' : 'var(--text-secondary)';
  const titleIconColor = hover || active ? 'var(--color-blue)' : 'var(--text-secondary)';
  return (
    <React.Fragment>
      {/* §13 — prod's submenu title is a bare `<li onClick>`: not focusable, not announced, and
         unopenable without a pointer. The paint is unchanged; the control inside it is real. */}
      <li onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ marginBottom: 36 }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'flex-start', fontWeight: 500, cursor: 'pointer', color: titleColor, fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-base)', transition: 'color 0.3s' }}>
          <span style={{ display: 'flex', marginRight: 12, color: titleIconColor, transition: 'color 0.3s' }}><Icon /></span>
          <span>{title}</span>
          <span aria-hidden style={{ marginLeft: 'auto', display: 'flex', transform: open ? 'rotate(0deg)' : 'rotate(180deg)', color: titleIconColor }}><ArrowIcon /></span>
        </button>
      </li>
      {open && (
        <ul style={{ marginTop: -20, marginLeft: 8, marginBottom: 28, paddingLeft: 12, borderLeft: '1px solid var(--text-secondary)', listStyle: 'none' }}>
          {subs.map((s, i) => (
            <SubItem key={s.label} label={s.label} href={s.href} testId={s.testId} parent={title}
              active={s.active != null ? s.active : s.label === clickedSub} last={i === subs.length - 1}
              onNavigate={onNavigate}
              onClick={() => { setClickedSub(s.label); if (onSelectSub) onSelectSub(title, s.label); }} />
          ))}
        </ul>
      )}
    </React.Fragment>
  );
}

/**
 * Sidebar — left navigation rail recreated from components/appLayout/Sidebar.
 * Fixed 290px width, 80px logo header, expandable submenus with a blue-tinted
 * active sub-item. `active` sets the active top-level section; `activeSub` optionally
 * sets which sub-item of that section reads as current.
 *
 * §13 — `items` is the omission this fills. Blue hardcodes Teamplay's seven groups, because a
 * measurement of one product has only one nav to measure; a consuming product supplies its own
 * (`§D6`). The default is still Teamplay's, so blue's own kit and template are unchanged.
 * Each entry may carry `href`, `testId` and its own `active`, which is what lets a router own
 * the current-row question instead of the component guessing it from a click.
 */
export function Sidebar({
  items = NAV, active = 'Timesheets', activeSub, onSelect, onNavigate, onLogoClick, logoHref,
  onClose, label = 'Main', className, style, ...rest
}) {
  return (
    <aside {...rest} className={['ds-sidebar', className].filter(Boolean).join(' ')}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', ...style }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 80, padding: '0 24px', backgroundColor: '#fff', borderBottom: '1px solid var(--border-subtle)' }}>
        {/* prod: <Link to="/" aria-label="Main page link"> — the logo is the route to the start page. */}
        <a href={logoHref || '#'} aria-label="Main page link"
          onClick={rowClick(logoHref, onNavigate, onLogoClick ? () => onLogoClick() : undefined)}
          style={{ display: 'flex', alignItems: 'center' }}><Wordmark /></a>
        {/* §14 — prod draws this button and then hides it with `display: none`. It is the
           drawer's close control, and the rule that reveals it is the breakpoint blue never
           wired; `.ds-sidebar-close` in base.css is now that rule. */}
        <button type="button" className="ds-sidebar-close" aria-label="Close sidebar" onClick={onClose} style={{ color: 'var(--text-secondary)' }}><MenuIcon /></button>
      </div>
      <nav aria-label={label} style={{ flexGrow: 1, padding: '36px 24px', backgroundColor: '#fff', overflowY: 'auto' }}>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map((item) => {
            const isActive = item.active != null ? item.active : item.title === active;
            if (item.type === 'link') {
              return (
                <TopLink key={item.title} Icon={item.Icon} title={item.title} href={item.href}
                  testId={item.testId} active={isActive} onClick={onSelect} onNavigate={onNavigate} />
              );
            }
            const subs = item.subs.map((s) => (typeof s === 'string' ? { label: s } : s));
            return (
              <SubMenu key={item.title} Icon={item.Icon} title={item.title} subs={subs} active={isActive}
                defaultOpen={isActive} defaultSub={isActive ? activeSub : undefined}
                onSelectSub={onSelect} onNavigate={onNavigate} />
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
