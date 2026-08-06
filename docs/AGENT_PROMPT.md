# Copy-paste prompt for the receiving agent

You are taking over the HK Transit AI V2 handoff. Read `HANDOFF.md`, `docs/PROJECT_STATUS.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_REFRESH.md` and `docs/DEPLOYMENT.md` before changing code.

Work on a new branch and do not replace the current live GitHub Pages site until a preview is approved by the owner.

Execute in this order:

1. Inspect the repository and report any mismatch with the handoff documents.
2. Run `npm install` using the public npm registry.
3. Run `npm run data:refresh`. Confirm `src/data/gmb.json` has `schemaVersion: 2` and `sourceRouteId`, `routeSeq`, `stopSeq` on route-stop entries.
4. Run `npm run verify` and `npm test`.
5. Fix actual build/type/test problems using test-first changes; do not remove estimate/confidence disclosures.
6. Run `npm run build:web` and serve `dist/` locally.
7. Test both English and Traditional Chinese, location denied/allowed states, several KMB/CTB/GMB/MTR journeys, direct and transfer results, all five comfort modes, route map, stop ETA and foreground live speed recalibration.
8. Deploy to a new preview path/branch and provide the owner with the preview URL plus a concise test report.
9. Wait for owner approval before replacing the existing production static page.

Non-negotiable constraints:

- No project-operated server.
- No secret or unrestricted paid API key in the client.
- Do not claim full turn-by-turn walking navigation; current geometry is approximate.
- Do not claim verified shade/cover/air-conditioning percentages; current comfort values are proxies.
- Keep Traditional Chinese and English copy in sync.
- Do not enable background location in this stage.

After web approval, follow `docs/IOS_HANDOFF.md` for the iOS adapter and TestFlight preparation.
