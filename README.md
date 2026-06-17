# PaperHive

PaperHive is a static, offline-first PDF product built with HTML, CSS, JavaScript, PDF.js, jsPDF, and JSZip.

## Structure

- `index.html` — landing page with clear feature sections, workflow, tool categories, privacy-first messaging, and CTAs.
- `workspace.html` — upload, unlock, viewer, editor, converter and export workspace.
- `about.html` — full mock about-me profile, social links, and contact details without an email button.
- `docs.html` — all legal docs in one place: privacy policy, terms, acceptable use, security notes, disclaimer, cookies/tracking, legal contact.
- `privacy.html` and `terms.html` — lightweight compatibility pages that point to `docs.html`.

## Workspace features

- Upload locked or unlocked PDFs locally
- Enter an authorized PDF open password and view with offline PDF.js
- Download an unlocked, sanitized, flattened PDF rebuild
- PaperKnife-style visual editor layer with select, drag, resize, text, freehand drawing, signature images, highlights, redaction boxes, and watermarks
- Drag to rearrange pages, skip/restore pages, and export page ranges such as `1-3, 5, 8`
- Convert PDF pages to PNG/JPEG ZIP
- Convert images to PDF
- Convert text notes to PDF
- Privacy-first legal authorization checkbox and clear-session controls
- Service worker and local vendor assets for offline use

## Important note about unlocking

PaperHive does not crack unknown passwords. It opens PDFs only when you provide a valid password you are authorized to use. The exported “unlocked” copy is rebuilt from rendered page images, so it is password-free and flattened, but may not preserve selectable text, forms, bookmarks, layers, metadata, attachments, or digital signatures.

## Run locally

Because modern browser modules and PDF.js workers are more reliable from a local server than from `file://`, run:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Use the landing page first, then click **Launch PDF Workspace**.

## No APIs

The app contains no remote API calls, analytics, ads, external fonts, or CDN dependencies. All PDF.js assets are vendored in `assets/vendor/`.
