# Garden of Life (working title)

A garden that grows from your memories. Tell Auntie Bee one small thing about
your life, and a plant grown from that story joins your garden.

Status: overnight build in progress. This README is rewritten honestly at the
end of the run. Until then, treat `BUILD-REPORT-2.md` at the repo root as the
source of truth for what is real.

Run: `node server.js` from the repo root, open `http://localhost:4173/garden-of-life`
on a phone-sized viewport (390x844).

Contracts: `content/SCHEMAS.md` binds the content banks, trait vocabularies,
asset paths, and the QA clock. The AI seams live in `shared/ai.js`
(`aiGenerate`, `aiClassifyPhoto`), each with a SWAP POINT for the CodeBuddy
phase.
