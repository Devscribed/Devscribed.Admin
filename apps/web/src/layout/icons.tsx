'use client';

/**
 * Meridian ships no icon library — the app template carries its glyphs as raw paths in
 * one `P` dictionary. These are lifted verbatim from
 * `1_DS for dev/templates/meridian-app/MeridianApp.dc.html` so the shell stays on-brand:
 * geometric, filled with `currentColor`, no strokes.
 */

export function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 16" width={19} height={19} fill="currentColor" aria-hidden>
      <path d="M1.69995 16C1.48328 16 1.30412 15.9291 1.16245 15.7875C1.02078 15.6458 0.949951 15.4666 0.949951 15.25V13.65C0.949951 13.0666 1.09995 12.5375 1.39995 12.0625C1.69995 11.5875 2.11662 11.2333 2.64995 11C3.86662 10.4666 4.96245 10.0833 5.93745 9.84998C6.91245 9.61664 7.91662 9.49998 8.94995 9.49998C9.98328 9.49998 10.9833 9.61664 11.95 9.84998C12.9166 10.0833 14.0083 10.4666 15.225 11C15.7583 11.2333 16.1791 11.5875 16.4875 12.0625C16.7958 12.5375 16.95 13.0666 16.95 13.65V15.25C16.95 15.4666 16.8791 15.6458 16.7375 15.7875C16.5958 15.9291 16.4166 16 16.2 16H1.69995ZM17.9 16C18.0666 15.9666 18.1999 15.8791 18.2999 15.7375C18.4 15.5958 18.45 15.4166 18.45 15.2V13.65C18.45 12.6 18.1833 11.7375 17.65 11.0625C17.1166 10.3875 16.4166 9.84164 15.55 9.42498C16.7 9.55831 17.7833 9.75414 18.7999 10.0125C19.8166 10.2708 20.6416 10.5666 21.275 10.9C21.8249 11.2166 22.2583 11.6083 22.575 12.075C22.8916 12.5416 23.0499 13.0666 23.0499 13.65V15.25C23.0499 15.4666 22.9791 15.6458 22.8375 15.7875C22.6958 15.9291 22.5166 16 22.2999 16H17.9ZM8.94995 7.97498C7.84995 7.97498 6.94995 7.62498 6.24995 6.92498C5.54995 6.22498 5.19995 5.32498 5.19995 4.22498C5.19995 3.12498 5.54995 2.22498 6.24995 1.52498C6.94995 0.824976 7.84995 0.474976 8.94995 0.474976C10.05 0.474976 10.95 0.824976 11.65 1.52498C12.35 2.22498 12.7 3.12498 12.7 4.22498C12.7 5.32498 12.35 6.22498 11.65 6.92498C10.95 7.62498 10.05 7.97498 8.94995 7.97498ZM17.95 4.22498C17.95 5.32498 17.6 6.22498 16.9 6.92498C16.2 7.62498 15.3 7.97498 14.2 7.97498C14.0166 7.97498 13.8125 7.96248 13.5875 7.93748C13.3625 7.91248 13.1583 7.86664 12.975 7.79998C13.375 7.38331 13.6791 6.87081 13.8875 6.26248C14.0958 5.65414 14.2 4.97498 14.2 4.22498C14.2 3.47498 14.0958 2.81248 13.8875 2.23748C13.6791 1.66248 13.375 1.13331 12.975 0.649976C13.1583 0.599976 13.3625 0.558309 13.5875 0.524976C13.8125 0.491642 14.0166 0.474976 14.2 0.474976C15.3 0.474976 16.2 0.824976 16.9 1.52498C17.6 2.22498 17.95 3.12498 17.95 4.22498Z" />
    </svg>
  );
}

/*
 * `MyInterviewsIcon` — the template's clock — was here, and went with its row: My
 * interviews is the `Assigned to me` scope of the candidate list now, and a scope tab
 * takes no glyph. It is in the history rather than kept unused.
 *
 * `VacanciesIcon` (a folded document), `CandidatesIcon` (a ruled sheet) and `SettingsIcon`
 * (a cog) followed them for the same reason, and it is worth saying which reason: their
 * rows still exist, but they are sub-items now, and blue's submenu draws a glyph on the
 * parent title alone. Three icons nothing renders would have read as three the rail had
 * simply forgotten to hang.
 *
 * That leaves `PeopleIcon` doing double duty — `People` and `Hiring` draw the same mark,
 * because the set has no hiring glyph and the design would rather show the omission than
 * paper over it (`ds-additions.md #10`).
 */
