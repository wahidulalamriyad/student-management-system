# Classfolio — attendance, marks and student portfolios

> **© 2026 Wahidul Alam Riyad. All rights reserved.**
> This software is proprietary. You may not copy, modify, redistribute, host, sell or use it, in whole or in part, without the author's prior written permission. See [LICENSE](LICENSE).

**Classfolio** is a static web app for managing all your intakes, courses and sections, with light and dark mode. It brings together everything from the Portfolio Excel files and the Attendance Management System.

- **Hosting:** the site runs on **GitHub Pages**.
- **Database:** **Supabase**.
- **For faculty:** manage students, attendance, marks, groups, grades and course outcomes in one place.
- **For students:** one link — the **Student Portal**. They type their Student ID to mark attendance with the PIN on your screen, and to see their portfolio once you publish it.

## Features

**Faculty (`admin.html`)**
- **Dashboard:** every section as a card, with live "attendance is open" banners and an intake filter.
- **Intakes & Courses:** add, rename and delete intakes and courses.
- **New Section:** pick the intake, course, number of classes, instructor and an **assessment plan preset**.
- **Overview tab:**
  - Attendance by class and the students below the minimum attendance.
  - A Marks & Grades summary.
- **Classes tab:**
  - Start the PIN for any class, and edit its date and topic.
  - Mark everyone present, add classes, and add, rename or delete terms.
- **Students tab:**
  - Upload the Valid Student List, add or edit students, and search, filter and sort.
  - Open each student's attendance record or full portfolio.
- **Attendance tab:**
  - The student × class sheet: click a cell to set Present / Late / Excused / Absent.
  - Bulk actions per class, and a print view.
- **Marks tab:**
  - A spreadsheet-style gradebook per term, with live totals and grades.
  - **Saves by itself** as you type.
  - Keyboard navigation: Enter moves down, and the arrow keys move between cells.
  - **Paste a block of marks straight from Excel.**
  - Checks every mark against its full mark.
  - Download and upload a marks sheet.
- **Assessment Plan:**
  - Items, groups, full marks, weights and COs.
  - Group rules: Add Up (exam parts and rubric criteria), Best One (quizzes) or Average.
  - Attendance items are filled in automatically.
  - Group-marked items and a Hidden-from-students switch.
  - Term weights: Mid 40% / Final 60%.
  - Group rules:
    - **Add Up** for exam parts and rubric criteria.
    - **Add Up & Round Up** for project rubric components: ROUNDUP(sum ÷ 15 × 10), as in the Project Evaluation sheets.
    - **Best One** for quizzes. The parts of one quiz count together, e.g. Quiz 1 with its CO3 question.
    - **Average.**
  - Presets taken from the course outlines and Portfolio files:
    - **Web Technologies (CSC 3215), 3 credits:**
      - Attendance & Performance 10%, 2 Quizzes (best 1) 20%, Project Prototype 20%, Term Exam 50%.
      - The Term Exam is Analytical (CO1 / CO2, 2 rubric criteria × 10) + Short 10 + Code Writing 20.
      - Prototype 1 is CO3 and Prototype 2 is CO4. Each has 2 criteria, and each criterion is built from 3 components marked 0–5.
    - **Theory of Computation (CSC 3113), 3 credits:**
      - Attendance 10%, 2 Quizzes (best 1) 30%, Written Exam marked /100 → 60%.
      - CO3 is the Mid Quiz 1 DFA question, CO2 and CO4 are on the Mid Term Exam, CO1 is on the Final Term Exam. Each CO question has 3 criteria × 5.
    - **Data Structure Lab (CSC 2107), 1 credit:**
      - Attendance & Performance 10%, Lab Tasks 30%, Assignment & Viva (/20 → 40%), Lab Exam (/20 → 20%).
      - CO1–CO4 each have 2 criteria × 10.
    - A standard theory course and a standard lab course.
  - **Grading rules for every course, as in the outlines:**
    - Mid 40% + Final 60%.
    - Attendance mark = classes attended ÷ classes in the term × 10.
    - AIUB grade scale, graded on the exact total (85 – < 90 = A).
    - A CO is attained at 60%.
- **Groups tab:**
  - Project groups, up to 10 groups (11 when there are more than 40 students).
  - A student can only be in one group, and the same groups are used for every term.
  - Auto-create groups by list order or at random.
  - **One mark per group** for group items — every member gets it.
- **Results tab:**
  - Term totals, grand total, the **current standing** while marks are still coming in, final grade and grade point.
  - Attendance and COs attained, plus special grades (I / W / UW).
  - Grade distribution and **CO attainment**.
  - Publish portfolios to students with one switch.
- **Settings tab:**
  - Late-after, minimum attendance and the one-device rule.
  - Instructor name and portfolio publishing.
  - The **grade scale** (AIUB default) and rounding.
  - **Course outcomes**: statement, PO, level, target % and credit hours.
- **Check-In Log tab:** every record, with shared-device warnings.
- **Excel export:** Info, Summary, Results, Marks per term, Groups, Attendance per term (1/0, ready for the Portfolio), Detail (P/L/E/A), Classes, Check-in Log.

**Classroom PIN screen (`pin.html`)**
- **The PIN:** six large digits that flip when the PIN changes every 15 seconds, with a countdown.
- **Joining:** a QR code for the Student Portal.
- **Live progress:** the present / enrolled count, a late counter and a live feed of check-ins.
- **Controls:** +5 min, End, Full screen (`F`) and hide the side panel (`H`).

**Student Portal (`index.html`)**
- **Find my courses:** type the Student ID to see every course and section the student is in, with their attendance %.
- **Check in:** when any of their classes is open, a PIN box appears. The student types the PIN once, and it is checked against all their open classes.
- **My Portfolio** (after you publish):
  - Grand total, current standing and grade.
  - Every assessment with marks, weighted marks and the section average.
  - Course outcome attainment and attendance per class.
  - Their project group and the grading scale.
  - A print option.
- **Privacy:**
  - Student names are never shown in the portal, and hidden items stay hidden.
  - **Optional personal access codes:** turn on *Require a Personal Access Code* in Settings so a student needs their own 6-character code, as well as their ID, to open a portfolio. Download the code list from Settings.
  - "Change ID" clears the saved codes on a shared device.

**Integrity**
- One attendance record per student per class.
- The ID must be on your list.
- 5 wrong PINs lock that ID for the class.
- One device per student per class (optional).
- The PIN is made on the server.
- Each faculty account sees only its own data.
- **Security:**
  - The portal allows at most 300 different Student IDs per connection per hour, and 10 wrong access codes lock a portfolio for an hour.
  - Every page has a Content Security Policy.
  - The Supabase and QR libraries are bundled at fixed versions in `assets/vendor/`.

---

## Day-to-day use

1. **Start of semester:**
   1. Click **New Section** and choose your course's assessment plan.
   2. Open **Students ▸ Upload List**.
   3. Share the **Student Portal** link (copy it, or show the QR code) once. It is the same link for every course.
2. **Each class:** click **Start Class-NN** at the top of the section. That opens the PIN screen. Press **Start attendance**.
   - Students open the link and type their ID and the PIN.
   - Press **End** when done.
3. **Corrections:** use the **Attendance sheet** tab, and click a cell.
   - **Late** and **Excused** both count as attended.
   - **Absent** removes the record.
4. **At-risk students:** check the **Overview** tab to see who is below your minimum.
5. **Marks:**
   1. In the **Marks** tab, type or paste marks for each term. They save by themselves.
   2. Give group project marks in the **Groups** tab.
   3. When you're ready, switch on **Show to Students** in the **Results** tab. Students then see their portfolio in the Student Portal.

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
