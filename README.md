# Sommet

Race websites, course maps, and registration in one repository.

## Structure

```
backend/        shared FastAPI registration service (one backend for all sites)
portfolio/      Sommet Innovations landing page (this repo's front door)
sites/          each live event's own site, one folder per race
  press-expedition-50/
  puddlejumpers/
  solstice-mile/
demos/          portfolio pieces & interactive experiments, not live races
  wurl-course-map/
  ins_live_map/
packages/       shared front-end packages (planned)
```

Use `git mv` next time you shuffle things, and re-verify any `fetch`, `src`,
`href`, and `import` paths that point across directories (they live as relative
paths, so a move changes their resolution).

## Quick start

Serve the whole repo so the portfolio gallery (which iframes the live sites and
demos) keeps working:

```bash
cd portfolio
npm run dev          # npx serve ../.. — serves the repo root
```

Or serve/run pieces individually:

```bash
npm run dev:wurl      # serves demos/wurl-course-map in isolation
npm run dev:live      # runs the WebSocket relay for demos/ins_live_map
```

Run the backend separately (see `backend/README.md`):

```bash
cd backend
uvicorn main:app --reload
```

Each site file then talks to whatever `window.SOMMET_API_BASE` its `config.js`
points at (default `http://localhost:8000`).