# Class Attendance — rotating-PIN check-in

> **© 2026 Wahidul Alam Riyad. All rights reserved.**
> This software is proprietary. You may not copy, modify, redistribute, host, sell or use it, in whole or in part, without the author's prior written permission. See [LICENSE](LICENSE).

A free, static web app for taking class attendance, with light and dark mode.

- **Hosting:** the site runs on **GitHub Pages**.
- **Database:** **Supabase** (free tier).
- **How check-in works:** students open one fixed link for their section and type their **Student ID** and the **6-digit PIN on your screen**. The PIN changes every 15 seconds.

## Features

**Faculty (`admin.html`)**
- **Dashboard:**
  - All your sections as cards, each with average attendance.
  - Live "attendance is open" banners.
  - Search and filter by intake.
- **Intakes, courses and sections:**
  - Intakes and courses can be added, renamed and deleted.
  - A new section gets *Mid Term* and *Final Term* with as many classes as you choose. You can create a new intake or course from the same form.
- **Overview tab:**
  - Attendance-by-class chart.
  - Distribution bands.
  - The list of students **below the minimum %**, with a one-click "copy IDs".
  - Counts of on-time, late, excused, PIN and manual records.
- **Classes tab:**
  - Start, reopen or open the PIN screen for each class.
  - Edit a class's date and topic.
  - **Mark everyone present**, clear attendance, add or delete classes, and add, rename or delete terms.
- **Students tab:**
  - Upload the *Valid Student List* (.xlsx / .csv) and preview it before importing.
  - Add or edit a single student.
  - Search, filter (below %, 100%) and sort.
  - Download the list or a template.
  - Click a student to see their **attendance profile** and change any mark.
- **Attendance sheet tab:**
  - A grid of every student × class.
  - Click a cell to mark **Present / Late / Excused / Absent**.
  - Click a class number for bulk actions.
  - Print.
- **Check-in log tab:**
  - Every record with time, status, PIN or manual source, and device.
  - **Shared-device warnings** flag one phone checking in two students.
- **Settings tab:**
  - **Late after N minutes**.
  - **Minimum attendance %**.
  - One-device-per-class rule.
  - Regenerate the student link.
  - Delete the section, which requires typing the section name to confirm.
- **Excel export:** Info, Summary, one sheet per term (1/0, ready for the Portfolio), Detail (P/L/E/A), Classes, Check-in Log.
- **Account:** change your password, and recover it by email.

**Classroom PIN screen (`pin.html`)**
- **The PIN:** large digits that flip when the PIN changes, with a countdown bar.
- **Joining:** a QR code for the student link.
- **Live progress:** a ring with present / enrolled, a late counter and a live check-in feed.
- **Controls:**
  - Choose the session length (3–30 min), then **+5 min** or **End**.
  - **Full screen** with the `F` key; hide the side panel with the `H` key.
  - A "Next class" button.

**Students (`attend.html`)**
- **Status:** shows whether attendance is open, with a countdown to closing.
- **Entering the PIN:** six digit boxes with auto-advance and paste support. The form submits by itself when all 6 digits are typed.
- **Confirmation:** an on-time / late badge, and the student's **own attendance %** so far. This is shown only after a valid PIN check-in, so nobody can look up another student by ID.

**Integrity**
- One record per student per class.
- The ID must be on your uploaded list.
- 5 wrong PINs lock that ID for the class.
- One device per student per class (optional).
- The PIN is made on the server, and the current and previous PIN are accepted.

---

## Day-to-day use

1. **Start of semester:**
   1. Click **New section**.
   2. Open **Students ▸ Upload list**.
   3. Share the **Student link** (copy it, or show the QR code) once with the class.
2. **Each class:** click **Start Class-NN** at the top of the section. That opens the PIN screen. Press **Start attendance**.
   - Students open the link and type their ID and the PIN.
   - Press **End** when done.
3. **Corrections:** use the **Attendance sheet** tab, and click a cell.
   - **Late** and **Excused** both count as attended.
   - **Absent** removes the record.
4. **At-risk students:** check the **Overview** tab to see who is below your minimum.

### Export and merge into the Portfolio
Click **Export Excel**. Each term sheet has `Student ID | Student Name | Class-01 … Class-NN | Present | Classes Held | Attendance %`.

- **Cell values:** `1` = attended, `0` = absent, blank = class not held yet.
- **Row order:** rows follow your uploaded list, which matches the Portfolio master.

To merge, copy the Class columns of a term sheet. Then, in the master's **Mid Overall** or **Final Overall** sheet, use **Paste Special ▸ Values**. If the two files might be in different orders, use a lookup instead, e.g. `=INDEX(Export!C:C, MATCH($B5, Export!$A:$A, 0))`.

## Notes
- **Privacy:** each faculty account sees only its own data, enforced by Row Level Security. Students can only call the two check-in functions.
- **Theme:** the light/dark choice is remembered per device. It starts from the device's own setting.
- **Free-tier pausing:** Supabase free projects pause after about a week with no activity. Click *Restore* in the dashboard if that happens.
- **Time zone:** all times are shown in Bangladesh time (Asia/Dhaka).

---

## License and copyright

**© 2026 Wahidul Alam Riyad. All rights reserved.**

This repository is published only so that the app can be hosted. Making the source code visible does **not** grant any rights to it. Without the author's prior written permission, you may not:

- copy, fork, clone or download this code to reuse it;
- modify it or build other software from it;
- host or deploy your own copy, or connect it to another database;
- sell, license, share or distribute it, in whole or in part;
- remove or change this notice.

Students and faculty may use the hosted site only for the course attendance it was set up for.

To request permission, contact the author, Wahidul Alam Riyad.
See the full terms in [LICENSE](LICENSE).
