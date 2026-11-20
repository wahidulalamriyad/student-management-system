Third-party libraries bundled with Classfolio (both MIT licensed):

- supabase.js — @supabase/supabase-js 2.119.2 (dist/umd/supabase.js), https://github.com/supabase/supabase-js
- qrcode.min.js — qrcodejs 1.0.0, https://github.com/davidshimjs/qrcodejs

Bundling them (instead of loading "latest" from a CDN) means the code that runs is fixed and reviewed.
SheetJS (Excel import/export) is loaded on the faculty page only, pinned to version 0.20.3 from cdn.sheetjs.com.
