# 0066 — Create meetings from the calendar (plan)

Date: 2026-11-24 · Status: **proposed plan, not built** (owner request) · Builds on 0037, 0039, 0040, 0050

- **Request.** Click any empty part of the Meetings page calendar to open a dialog that creates a meeting at that time, where the coach can set the time, client, program, notes, and one-off or repeating.
- **Today.** Meetings are created only from a client's page (Meetings card): **New meeting** (`NewMeetingDialog`) and **Repeat** (`PatternDialog`). Both need one client's meeting context (`useMeetingContext`: services, primary coach, time zone, current programs, patterns) and programs. On the calendar, clicking a meeting opens its preview, and clicking a day heading (week view) or a day cell (month view) opens that day.

## Where clicks go

- **Week and day views:** clicking or tapping empty time in a day column opens the dialog at that time, rounded down to 15 minutes, with the coach's default length (60 minutes, or the length of the client's last meeting once a client is chosen). Meetings, day headings and the striped unavailable areas keep their current behaviour. Clicking a striped area still opens the dialog, with the "outside your availability" note.
- **Month view:** the day number keeps opening the day view. Clicking empty space in a day cell opens the dialog on that day at the start of the coach's first open time, or 09:00 if none is set.
- **Hover (mouse):** a faint 15-minute ghost block follows the pointer in week and day views and shows the time, so the coach can see where a click will land. None on touch.
- **Keyboard and screen readers:** a **New meeting** button in the calendar's toolbar opens the same dialog at the next 15-minute mark, since grid cells aren't focusable. Any time can be chosen inside the dialog.

## The dialog

One dialog (`CalendarMeetingDialog`) built from the existing parts, so creating a meeting keeps one set of rules:

1. **Client.** A `ComboboxField` of clients the coach can access with an active or paused service that can have meetings. It searches by name, like coach search. Until a client is chosen, the other fields are shown but disabled.
2. **One-off or repeating.** A `SegmentedControl`: **One meeting** / **Repeating**.
   - *One meeting* shows `NewMeetingDialog`'s fields: date, time, length, topic (services), program per service, and notes.
   - *Repeating* shows `PatternDialog`'s fields, pre-filled with the clicked weekday and time in week 1 and "starts" on the clicked date. The server preview of the next six meetings shows as it does now.
   - Both forms are pulled out of their dialogs into field components (`MeetingFields`, `PatternFields`) used by the old dialogs and the new one. No behaviour changes on the client page.
3. **Program.** Per service, as today: the client's current program by default, or another published one. It loads once the client is chosen (`useMeetingContext(clientId)` and their programs).
4. **Notes.** Staff-only notes for one meeting; pattern notes for repeating ones. Shared notes and the client-visible description (if decision 0064 adds one) can come later.
5. **Warnings, not blocks:** the existing overlap notice ("It overlaps …"), and new notes when the time is outside the coach's availability or on time off, from the data the calendar already loads. A paused service, no primary coach or no meeting link show the same setup notices as the Meetings card.
6. **Save** creates through the existing `add_meeting` or `create_meeting_schedule`. The calendar refetches, and the toast says "Meeting added for …" with the overlap note, as the client page does.

## Time zones and coaches

- The calendar shows times in the viewer's profile zone. Meetings are stored in the client's primary coach's zone (decision 0037). The clicked instant is converted to the client's coach zone when a client is chosen. If the zones differ, the dialog labels both ("10:00 your time · 11:00 Priya's time").
- A meeting always belongs to the client's primary coach. When an administrator clicks on their own calendar and picks a client whose primary coach is someone else, the dialog says "This meeting will be with Priya". The conflicts section (decision 0063) then shows it under that coach.

## Build steps

1. Extract `MeetingFields` and `PatternFields` from the two dialogs, with no visual change, plus a regression pass on the client page.
2. `CalendarMeetingDialog` with the client combobox, the one-off and repeating switch, time zone handling and availability notes. Unit tests for click-to-time (15-minute rounding, daylight-saving days, month-view default time).
3. Calendar click targets, the hover ghost block, the toolbar **New meeting** button, and Help (Meetings page section) updates.
4. No server changes are expected: the dialog uses the existing functions, and their checks (access, ended services, primary coach) still apply.

## Open questions

1. Default length: always 60 minutes, or the client's most recent meeting length? Recommended: the most recent, else 60.
2. Should dragging down a day column set the length, as in Google Calendar? Recommended: later, after click-to-create.
3. Which clients does the picker list for an administrator: every client with a meeting-capable service, or only the admin's own? Recommended: everyone they can access, with the coach's name beside each.
