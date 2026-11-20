// =============================================================================
//  Attendance Management System — configuration
//  Fill in the two values from Supabase:
//    SUPABASE_URL      = Project URL only, e.g. https://abcd1234.supabase.co  (no /rest/v1/)
//    SUPABASE_ANON_KEY = Publishable key (sb_publishable_...) — never the secret key
//  The "anon public" key is meant to be public; the database rules protect your data.
// =============================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://yqprzeooqffmuhcjqhge.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_jwVJpLFAxYHkyrehTQwtRA_TWhgjhpv",

  // Shown in page headers
  INSTITUTION: "American International University-Bangladesh",

  // Student ID format hint and check on the student page (set to null to accept anything)
  STUDENT_ID_PATTERN: "^\\d{2}-\\d{5}-\\d$",
  STUDENT_ID_EXAMPLE: "22-48341-3",

  // Default length of a PIN session in minutes (can be extended on the PIN screen)
  DEFAULT_SESSION_MINUTES: 10,

  // Time zone used for dates in the Excel export and screens
  TIME_ZONE: "Asia/Dhaka",
};
