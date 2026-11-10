# Payment Hub

Static payment methods website (HTML/CSS/Vanilla JS) for GitHub Pages.

## Features
- Responsive dark glassmorphism theme and animated hero
- Bank transfer cards, e-wallet QR cards, and USDT (TRC20)
- Search and favorites (browser localStorage)
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
