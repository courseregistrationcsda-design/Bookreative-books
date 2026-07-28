# Bookreative Studio (Web Prototype)

A framework-free, static PDF flipbook prototype for Bookreative Books. It uses vanilla HTML, CSS, and JavaScript and keeps PDF processing in the browser. PDF.js is bundled locally in `vendor/` — there is no CDN or build step.

## Files

- `index.html` — app shell and controls
- `styles.css` — responsive styling, themes, focus states, and motion styles
- `app.js` — PDF import/rendering, flipbook navigation, thumbnails, settings, and persistence
- `vendor/pdf.min.js` — bundled PDF.js 4.10.38 browser module
- `vendor/pdf.worker.min.js` — bundled PDF.js worker

## Run locally

Because PDF.js modules and workers need a web origin, serve the folder rather than opening `index.html` directly:

```bash
npx serve .
```

Then open the local URL printed by the command. Any static server also works, for example `python3 -m http.server 8080`.

## Deploy to Vercel

1. Push this folder to a Git repository.
2. Import the repository in Vercel.
3. Set **Framework Preset** to **Other**.
4. Use the repository root as the static output/root (there is no build command).
5. Deploy.

The included relative worker path (`./vendor/pdf.worker.min.js`) works on the Vercel site root and on nested static paths.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. In **Settings → Pages**, choose **Deploy from a branch**, select the branch, and choose the repository root; or place the files in `/docs` and select `/docs`.
3. Save and open the generated Pages URL.

All asset references are relative, so the app works when hosted from a repository subpath.

## Notes

- Page 1 is always a single cover; subsequent navigation uses spreads 2–3, 4–5, and so on, with a final single page when needed.
- LTR and RTL affect spread arrangement and keyboard/next/previous reading direction.
- Pages are rasterized to JPEG data URLs and retained in memory for this testing prototype. Large-file warnings appear for PDFs over 100 pages or 50 MB.
- Theme, high contrast, and reduce-motion preferences are stored with `localStorage` without an app-imposed storage cap.
- The branding copy intentionally follows the requested text: “by Cordillera School fo Digital Arts, Inc.”
