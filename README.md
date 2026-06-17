# PaperHive

> A private, offline-first PDF toolkit — unlock, edit, convert, and clean documents without ever uploading them.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://paperhive.vercel.app/) [![License](https://img.shields.io/badge/license-MIT-blue)]() [![Made with ❤️](https://img.shields.io/badge/made%20with-%E2%9D%A4-red)]()

---

## 🚀 Live Demo
[paperhive.vercel.app](https://paperhive.vercel.app/)

## ✨ Features
- Password unlock for PDFs you're authorized to open
- Offline viewer with zoom, rotate, and page navigation (PDF.js)
- Visual editor — text, freehand drawing, signature images, highlights, redaction boxes, watermarks
- Drag-to-reorder pages, skip/restore pages, export custom page ranges (e.g. `1-3, 5, 8`)
- Convert PDF pages → image ZIP, images → PDF, text notes → PDF
- Sanitized, flattened export that strips original metadata/scripts/encryption
- Fully offline-capable PWA — all vendor assets bundled locally, zero remote API calls

## 🛠 Tech Stack
| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| PDF Engine | PDF.js, jsPDF, JSZip (all vendored locally) |
| Hosting | Vercel |
| Offline | Service Worker + Web App Manifest |

## ⚡ Quick Start
```bash
git clone https://github.com/prvthmpcypher/PaperHive
cd PaperHive
python3 -m http.server 8080
```
Then open `http://localhost:8080` — start at the landing page, then launch the Workspace.

## 📁 Project Structure
```
PaperHive/
├── index.html          # Landing page
├── workspace.html       # Upload, unlock, edit, convert workspace
├── about.html           # About the maker
├── docs.html             # All legal docs (privacy, terms, security notes)
├── app.js                 # Core workspace logic
├── style.css
├── sw.js                  # Service worker for offline caching
├── manifest.webmanifest
└── assets/
    └── vendor/            # PDF.js, jsPDF, JSZip — bundled, no CDN
```

## 🔒 Security
This project follows security best practices: a strict Content-Security-Policy, no remote API calls or third-party analytics, and security headers (HSTS, X-Frame-Options, Permissions-Policy) configured via `vercel.json`. All processing happens client-side — your files never leave the browser.

## 📄 License
MIT © 2026 Poorvith

## 🤝 Connect
| Platform | Link |
|---|---|
| LinkedIn | [linkedin.com/in/prvthmp](https://linkedin.com/in/prvthmp) |
| GitHub | [github.com/prvthmpcypher](https://github.com/prvthmpcypher) |
| Instagram | [instagram.com/prvthmp](https://instagram.com/prvthmp) |
| Twitter/X | [x.com/prvthmp](https://x.com/prvthmp) |
| Buy Me a Coffee | [buymeacoffee.com/prvthmp](https://buymeacoffee.com/prvthmp) |

---
*Built and shipped by Poorvith · 2026*
