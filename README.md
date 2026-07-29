# Bookreative Books

A framework-free, static PDF flipbook prototype for Bookreative Books. It uses vanilla HTML, CSS, and JavaScript and keeps PDF processing in the browser. PDF.js is bundled locally in `vendor/` — there is no CDN or build step.

## Files

- `index.html` — app shell and controls
- `BOOKREATIVE.png` — responsive Bookreative branding logo used in the header
- `styles.css` — responsive styling, themes, focus states, and motion styles
- `app.js` — PDF import/rendering, flipbook navigation, thumbnails, settings, and persistence
- `vendor/pdf.min.js` — bundled PDF.js 3.11.174 tablet-compatible browser bundle
- `vendor/pdf.worker.min.js` — bundled PDF.js 3.11.174 worker
- `pdf.min.js` and `pdf.worker.min.js` — root-level copies used by the app for compatibility with static upload hosts that omit nested folders; the app loads these as a classic script for older tablet browsers

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
- Reading order is intentionally restricted to left-to-right. Page view choices include Book (cover + spreads), Two-page spread, and One page. Navigation uses a horizontal slide transition: the new view enters from the right when advancing and from the left when going back, over the previous view.
- Mobile controls include tap navigation (left half = previous, right half = next), swipe/edge-drag page turns, and pinch zoom. The layout responds automatically to portrait and landscape orientation. Page dimensions are scaled uniformly to preserve each PDF page's aspect ratio.
- Thumbnails are hidden by default. When enabled, the panel shows a maximum of 10 thumbnails at a time with previous/next thumbnail-window controls.
- Pages are rasterized to JPEG data URLs and retained in memory for this testing prototype. The cover and first spread render first, then remaining pages render progressively in the background; navigating to an unfinished page triggers its render immediately. Large-file warnings appear for PDFs over 100 pages or 50 MB.
- Theme and reduce-motion preferences are stored with `localStorage` without an app-imposed storage cap. The palette is based on the supplied image: Ocean Depth (`#0D1B2A`), Sunbeam (`#FFB703`), Deep Sea (`#2A9D8F`), and Lavender Haze (`#8E70C3`). Dark mode uses Ocean Depth rather than black.
- The interface opens directly into the studio without a splash screen. PDF rendering progress is shown in the reader status line.
