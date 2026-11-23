# Payment Hub

Static payment methods website (HTML/CSS/Vanilla JS) for GitHub Pages.

## Features
- Responsive dark glassmorphism theme and animated hero
- Bank transfer cards, e-wallet QR cards, and USDT (TRC20)
- Live Taiwan date and clock (updates every second)\n- Search and favorites (browser localStorage)
- Fullscreen QR viewer and copy actions
- Personal Admin Mode: create, edit, and delete banks / e-wallets
- Upload JPG / PNG QR images (up to 1.5 MB per image)
- Export / import personal payment data as a JSON backup

## Personal data and privacy
Admin changes are stored in the current browser only. They do not modify the published source files and do not affect other visitors or devices. To move data to another browser, export a backup and import it there. Clearing this browser's site data may remove the personal records, so keep a backup.

The first time Admin Mode is opened, create a password of at least 8 characters. A PBKDF2-SHA-256 hash and random salt are stored in this browser; the password itself is not stored. This is only a client-side access barrier. GitHub Pages is a static host and has no server-side authentication, so this must not be treated as strong security against someone with access to the browser or its developer tools.

QR image data is stored locally in browser storage. Keep image files reasonably small; if browser storage becomes full, reduce image sizes and export a backup.

## Deploy
Upload `index.html`, `style.css`, `script.js`, `README.md`, and the `images/` folder to the GitHub repository root, then commit and push. GitHub Pages will publish the updated static site.

## Phase 4 enhancements
- Dark / light appearance toggle (saved per browser)
- Payment overview counters with count-up animation
- Bank monogram identity marks (generated from each bank name; not official trademark artwork)
- Admin operation history (last 50 local actions)
- Hide / show payment methods without deleting them
- Refined gradients, soft glows, and hover interactions

Operation history and theme preferences are stored locally in the current browser. Hidden payment methods remain in personal data and can be shown again from Admin Mode.


## Supabase shared backend

This build connects to the Payment Hub Supabase project using its publishable key (safe for browser use when paired with the RLS policies). It loads shared payment methods from `public.payment_methods`, reads QR images from the public `payment-qr` bucket, and uses Supabase Auth for administrator sign-in.

### Before publishing this build
1. Run `SUPABASE_SETUP.sql` in Supabase SQL Editor. This creates shared admin activity history, grants the required table privileges, and removes the unnecessary broad Storage SELECT policy.
2. Confirm the `payment_admins` row exists for the intended administrator account.
3. Confirm `payment_methods` contains the 12 seeded rows and `qr_image_path` values point to the uploaded files in `payment-qr`.
4. Keep the `payment-qr` bucket public so visitors can fetch QR image public URLs. Uploading, updating and deleting objects remain restricted by Storage policies.
5. Publish the files to GitHub Pages.

### Admin sign-in
Click Admin Mode and enter the email/password of the Supabase Auth user whose UID is present in `public.payment_admins`. The password is sent directly to Supabase Auth over HTTPS and is not stored in this site's localStorage. Signing out exits admin mode.

### Shared data behavior
Payment method creation, editing, deletion, and visibility changes are written to Supabase and are shared by all visitors. Theme preference and favorites remain browser-local. The QR upload control accepts JPG/PNG up to 1.5 MB.


## Bank logos and responsive card layout
- Bank logo assets are stored locally in `images/bank-logos/` as transparent PNG files.
- Logos are displayed beside each bank name, not below the QR code.
- Logo paths are local to the GitHub Pages site; no third-party image host is required.
- Mobile card layout reduces QR and logo sizes while preserving account/action readability.

\n## 新增：親友轉帳與匯率換算\n\n- 首頁新增「親友轉帳資料」及「匯率換算」入口。\n- 親友查詢使用 Auth 使用者 `payment-viewer@payment-hub.local`；訪客只輸入該使用者建立時設定的共用密碼。此登入狀態獨立儲存，不會覆蓋管理員工作階段。\n- 管理員登入後可在親友頁新增、編輯、刪除資料；資料庫 RLS 仍是最終權限控管。\n- 請先執行 `SUPABASE_PRIVATE_FEATURES.sql`，確認 Viewer UID 與 SQL 中的 UID 一致。\n- 匯率頁直接嘗試讀取台灣銀行當日 CSV；若瀏覽器跨網域政策阻擋，頁面會顯示無法取得資料，不會捏造匯率。\n