# Class Attendance — rotating-PIN check-in

A free, static web app for taking class attendance. It runs on **GitHub Pages**, and **Supabase** (free tier) is the database.

- **Faculty (admin):**
  - Add intakes, courses, sections, terms (Mid / Final), classes and student lists (upload the Excel list).
  - Open a class to show a big **6-digit PIN that changes every 15 seconds**.
  - Export attendance to **Excel**.
- **Students:** each section has **one fixed public link**. Students open it, type their **Student ID** and the PIN on the screen, and attendance is recorded for the class that is open right now.
- **Integrity rules:**
  - One record per student per class (no duplicates).
  - The ID must be on the uploaded list.
  - 5 wrong PINs lock that ID for that class.
  - Optional: one phone per student per class.
  - The PIN is made on the server and never exists in the student page.

| Page | Who | What |
|---|---|---|
| `admin.html` | Faculty | Sign in, manage everything, export Excel |
| `pin.html?class=…` | Faculty (classroom screen) | Start / extend / end attendance, show PIN + QR + live count |
| `attend.html?s=…` | Students | Enter Student ID + PIN |

---

## 1. Set up Supabase (one time, ~5 minutes)

1. Go to <https://supabase.com>, sign in and create a **New project**. Any name works. Pick the Singapore region; it's closest to Dhaka.
2. Open **SQL Editor ▸ New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. The script is safe to run again later.
3. Create your faculty login in **Authentication ▸ Users ▸ Add user ▸ Create new user**. Enter your email and a password, and tick *Auto Confirm User*.
4. Stop strangers from signing up: **Authentication ▸ Sign In / Providers ▸** turn off **Allow new users to sign up**.
5. Copy your keys from **Project Settings ▸ API**:
   - **Project URL**, which looks like `https://abcd1234.supabase.co`
   - **anon public** key (labelled *Publishable key* in newer dashboards)

## 2. Configure the app

Edit **`config.js`**:

```js
SUPABASE_URL: "https://abcd1234.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",          // the anon / publishable key — NOT the service_role key
STUDENT_ID_PATTERN: "^\\d{2}-\\d{5}-\\d$",   // AIUB format 22-48341-3; set to "" to accept any ID
```

The anon key is meant to be public. Every table is locked by Row Level Security, so with this key students can only call the two check-in functions. **Never** put the `service_role` key in this file.

## 3. Deploy on GitHub Pages

1. Create a new GitHub repository, e.g. `attendance`. It can be public.
2. Upload every file in this folder, keeping the folder structure: `index.html`, `admin.html`, `attend.html`, `pin.html`, `config.js`, `.nojekyll`, `assets/`, `supabase/`, `templates/`.
   - Use **Add file ▸ Upload files** and drag the files in, or use `git push`.
3. In the repository, go to **Settings ▸ Pages ▸ Build and deployment**, set Source to *Deploy from a branch* and Branch to `main` / `(root)`, then **Save**.
4. After a minute your site is live at `https://<your-username>.github.io/attendance/`.
5. Back in Supabase, open **Authentication ▸ URL Configuration** and set **Site URL** to that address. Password-reset emails need this.

The admin page is `https://<your-username>.github.io/attendance/admin.html`. Bookmark it.

---

## Day-to-day use

### Start of semester
1. **admin.html ▸ Intakes:** add e.g. `Fall 2026-27`. **Courses:** add e.g. `CSC 3215 — Web Technologies`.
2. **Add section:** pick the intake and course, then enter the section (`R`), class code and *classes per term*. A **Mid Term** and a **Final Term** are created with Class-01 … Class-NN.
3. **Students tab ▸ Upload student list:** choose the university *Valid Student List* (.xlsx) or any Excel/CSV with a Student ID column and a Name column. See `templates/student_list_template.csv`.
   - Re-uploading merges the lists.
   - Tick the box in the dialog to also remove students who dropped.
4. Copy the **student link** (or show its **QR code**) and post it once in the class group or on the portal. It stays the same all semester.

### Every class
1. **Classes & PIN** tab ▸ click **Start PIN ▸** for today's class. A classroom screen opens.
2. Choose how long attendance stays open (default 10 min) and click **Start**. The PIN changes every 15 seconds, and the screen shows a live *present / enrolled* count and the latest check-ins.
3. Students open the link, type their ID and the current PIN, and see a ✔ with their name.
   - A PIN from the previous 15-second window is still accepted, so slow typers aren't punished.
4. Click **End attendance** when you're done, or let it close on its own. **+5 min** extends it.

Only one class per section can be open at a time. Opening another class closes the previous one.

### Fixing records
In the **Attendance sheet** tab, click any cell to mark a student present or absent by hand, e.g. for a student whose phone died. Your marks show as a blue ✔, PIN check-ins as a green ✔.

### Export to Excel and merge into the Portfolio
Click **⬇ Export Excel**. The file `Attendance_<course>_<intake>_Sec-<section>_<date>.xlsx` contains:

| Sheet | Contents |
|---|---|
| **Info** | Course, section, intake, export time |
| **Mid Term**, **Final Term** | Student ID, Student Name, **Class-01 … Class-NN** (1 = present, 0 = absent, blank = not held yet), Present, Classes Held, Attendance % |
| **Check-in Log** | Every record with time, PIN/Manual, and device |

Rows follow the order of the uploaded student list, which is the same order as the Portfolio master. To merge:

1. Open the export and the Portfolio master.
2. Select the Class columns of a term sheet (e.g. `C2:H47`), then copy.
3. In the master's **Mid Overall** (or **Final Overall**) sheet, click the first attendance cell of the first student and use **Paste Special ▸ Values**.
4. If the two lists might be in different orders, use a lookup instead, e.g. `=INDEX(Export!C:C, MATCH($B5, Export!$A:$A, 0))`.

---

## Security notes
- **Data separation:** each faculty account sees only its own intakes, sections, students and attendance (Row Level Security on every table).
- **What students can do:** call `get_section_public` (course name, and whether a class is open) and `submit_attendance`. They cannot read the student list, other students' records or the PIN.
- **How PINs are made:** the server derives them from a secret that is regenerated each time a class is opened, so a PIN from an old class never works again.
- **Proxy attendance:**
  - The PIN only appears in the room, and it changes every 15 seconds.
  - The *one device per student per class* option (Settings tab, on by default) stops one phone from checking in a friend.
  - A determined student could still message the PIN to a friend inside those 15 seconds. The Check-in Log shows times and device codes if you need to investigate.
- **If the link leaks:** **Settings ▸ Generate a new link** if the section link was shared outside the class.

## Limits & tips
- **Free-tier pausing:** Supabase free projects pause after about a week with no activity. Open the dashboard and click *Restore* if that happens. Regular class use keeps it awake.
- **Time zone:** times display in `Asia/Dhaka` (change `TIME_ZONE` in `config.js`).
- **Clocks:** the classroom screen gets the PIN from the server every second, so the laptop's clock doesn't matter.

## Files
```
index.html        landing page (redirects ?s=… links to the student page)
admin.html        faculty app            → assets/admin.js
pin.html          classroom PIN screen   → assets/pin.js
attend.html       student check-in       → assets/attend.js
config.js         your Supabase URL + anon key
assets/common.js  shared helpers, assets/app.css styles
supabase/schema.sql  database, security rules and functions
templates/student_list_template.csv
```
