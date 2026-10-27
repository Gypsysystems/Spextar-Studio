# Local Inter fonts

These are unmodified Inter variable WOFF2 fonts from the official
[Inter project](https://github.com/rsms/inter).

- Upstream revision: `353b61b9f4430d5f420d56605a6e7993e0941470`
- Upstream paths: `docs/font-files/InterVariable.woff2`,
  `docs/font-files/InterVariable-Italic.woff2`
- License: SIL Open Font License 1.1, reproduced in full in `OFL.txt`.
- A matching `public/fonts/OFL.txt` is shipped in production builds so the
  copyright and license accompany the browser-distributed fonts.
- Upright and italic faces support weights 100–900.

`src/fonts.css` loads these assets through Vite, including its configured base
path and production asset hashing. Studio does not need a third-party font
request. Keep the license with these fonts when redistributing the application.
