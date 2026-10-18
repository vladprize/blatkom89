# deploy/ — generated, do not edit

Prebuilt BLATKOM ’89 server and web client produced by `node tools/build-deploy.mjs` from the sources
in this repository. It needs only Node.js ≥ 22.12 and PostgreSQL: `node server.js` migrates the
database and serves the game, the API, `/admin` and the WebSocket endpoint on `PORT`.
Configuration is environment variables (see `.env.example` in the repository root and
`docs/DEPLOYMENT.md`); `render.yaml` in the repository root deploys it to Render.
