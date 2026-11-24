# 0066 — Create meetings from the calendar (plan)

Date: 2026-11-24 · Status: accepted (owner request; questions answered 2026-11-24) · Built · Builds on 0037, 0039, 0040, 0050

- **Request.** Click any empty part of the Meetings page calendar to open a dialog that creates a meeting at that time, where the coach can set the time, client, program, notes, and one-off or repeating.
- **Today.** Meetings are created only from a client's page (Meetings card): **New meeting** (`NewMeetingDialog`) and **Repeat** (`PatternDialog`). Both need one client's meeting context (`useMeetingContext`: services, primary coach, time zone, current programs, patterns) and programs. On the calendar, clicking a meeting opens its preview, and clicking a day heading (week view) or a day cell (month view) opens that day.

## Where clicks go

- **Week and day views:** clicking or tapping empty time in a day column opens the dialog at that time, rounded down to 15 minutes, for 60 minutes. Meetings, day headings and the striped unavailable areas keep their current behaviour. Clicking a striped area still opens the dialog, with the "outside your availability" note.
- **Month view:** the day number keeps opening the day view. Clicking empty space in a day cell opens the dialog on that day at the start of the coach's first open time, or 09:00 if none is set.
- **Hover (mouse):** a faint 60-minute block follows the pointer in week and day views and shows the time, so the coach can see where a click will land. None on touch.
- **Keyboard and screen readers:** a **New meeting** button in the calendar's toolbar opens the same dialog at the next 15-minute mark, since grid cells aren't focusable. Any time can be chosen inside the dialog.

## The dialog

One dialog (`CalendarMeetingDialog`) built from the existing parts, so creating a meeting keeps one set of rules:

1. **Client.** A `ComboboxField` of clients the coach can access with an active or paused service. It searches by name. The fields appear once a client is chosen; the description already shows the time and 60 minutes.
2. **One-off or repeating.** A `SegmentedControl`: **One meeting** / **Repeating**.
   - *One meeting* shows `NewMeetingDialog`'s fields: date, time, length, topic (services), program per service, and notes.
   - *Repeating* shows `PatternDialog`'s fields, pre-filled with the clicked weekday and time in week 1 and "starts" on the clicked date. The server preview of the next six meetings shows as it does now.
   - Both forms are pulled out of their dialogs into field components (`MeetingFields`, `PatternFields`) used by the old dialogs and the new one. No behaviour changes on the client page.
3. **Program.** Per service, as today: the client's current program by default, or another published one. It loads once the client is chosen (`useMeetingContext(clientId)` and their programs).
4. **Notes.** Staff-only notes for one meeting; pattern notes for repeating ones. Shared notes and the client-visible description (if decision 0064 adds one) can come later.
5. **Warnings, not blocks:** the existing overlap notice ("It overlaps …") in the saved toast. (Availability and time-off notes inside the dialog are not built yet.)
6. **Save** creates through the existing `add_meeting` or `create_meeting_schedule`. The calendar refetches, and the toast says "Meeting added for …" with the overlap note, as the client page does.

## Time zones and coaches

- The calendar shows times in the viewer's profile zone. Meetings are stored in the client's primary coach's zone (decision 0037). The clicked instant is converted to the client's coach zone when a client is chosen. If the zones differ, the dialog labels both ("10:00 your time · 11:00 Priya's time").
- A meeting always belongs to the client's primary coach. When an administrator clicks on their own calendar and picks a client whose primary coach is someone else, the dialog says "This meeting will be with Priya". The conflicts section (decision 0063) then shows it under that coach.

## Build steps

1. Extract `MeetingFields` and `PatternFields` from the two dialogs, with no visual change, plus a regression pass on the client page.
2. `CalendarMeetingDialog` with the client combobox, the one-off and repeating switch and time zone handling. Unit tests for click-to-time (15-minute rounding, daylight-saving days, month-view default time).
3. Calendar click targets, the hover ghost block, the toolbar **New meeting** button, and Help (Meetings page section) updates.
4. No server changes are expected: the dialog uses the existing functions, and their checks (access, ended services, primary coach) still apply.

## Owner answers (2026-11-24) and what was built

1. **Length: always 60 minutes.** The coach sees 60 before choosing a client, so it must not change in the background when a client is picked. Dragging sets another length.
2. **Drag to set the length: now.** In week and day views, dragging down a column stretches a dashed block in 15-minute steps, showing the start and minutes. Releasing opens the dialog with that start and length. With a mouse, a faint 60-minute block follows the pointer over empty time. On touch, a tap opens a 60-minute meeting and a swipe still scrolls (`touch-pan-y`; a gesture that scrolls is cancelled).
3. **Picker: everyone the viewer can access.** An administrator sees the coach's name after a client's name only when the client's primary coach is someone else. Coaches see names only. The list leaves out disabled clients and clients with no active or paused service.

**As built.**
- `NewMeetingForm` and `PatternForm` are the old dialogs' forms, each drawn through a `FormFrame` (`formFrame.tsx`). `NewMeetingDialog` and `PatternDialog` wrap them unchanged for the client page.
- `CalendarMeetingDialog` is one dialog throughout: the client combobox and the **One meeting** / **Repeating** switch, then the chosen form, whose buttons go into the dialog's footer through a portal. The form's start and length are reported back (`onStartChange`), so switching forms or clients keeps the time on screen. The dialog's description shows it in the viewer's zone.
- A client with no primary coach gets a notice instead of the form. When the primary coach isn't the viewer, a line says who the meeting is with and that the form's times are in their zone.
- Click and drag maths: `snapDown`, `dragRange`, `monthDefaultStart` (`src/domain/scheduling/calendarCreate.ts`), unit-tested. Month view: empty space in a day cell; the day number and "+N more" still open the day.
- A **New meeting** button beside **Today** starts at the next 15-minute mark, for keyboard users.
- Personal training lengths other than 60 or 40 (from a drag) show as "N min (no default price)", as for any meeting with another length.
- No server changes.

**Manual checks.**
- Week view: hover over empty time and a faint block follows. Click and the dialog opens at that 15-minute mark for 60 minutes. Choose a client and save. The meeting appears with a toast.
- Drag from 10:00 to 11:30: the block shows 90 min, and the dialog opens with 90 minutes.
- Clicking an existing meeting or a day heading works as before.
- Switch to Repeating: the clicked weekday is on, at that time, starting that day. Switch back: the time is kept.
- Month view: click empty space in a day and the dialog opens at your first open time (or 9:00). The day number still opens the day.
- New meeting button: opens at the next 15 minutes.
- As Matt (admin): clients whose primary coach is someone else show "(Priya Nair)", and Matt's own clients show just their name. Choosing one of Priya's clients says the meeting will be with Priya.
- On a phone: tapping empty time opens the dialog, and swiping scrolls.
- On a client's page, Add meeting and Repeat still work as before.
