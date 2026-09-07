# Audit della suite — python-package-visualizer

## Quadro

| Metrica | Valore |
|---|---|
| Layer | Solo extension TypeScript (B7: nessun backend/frontend separato) |
| File test | 22 file, **136** casi |
| Harness | Mocha TDD + `@vscode/test-electron` (`npm test`); unit runner Node (`npm run test:unit`) |
| Padding stimato | **Basso** — nessun file `*coverage*` / `*gaps*`; 1 file misleading rimosso |
| Coverage unit scope | **80.97%** linee, **73.46%** branch (moduli eseguiti dalla suite unit) |
| Soglia globale wired | `c8.json`: linee/statement **79%**, branch **72%**, funzioni **81%** |
| Coverage repo completo | ~37% linee su tutto `src/` (webview, commands, providers non coperti — gap documentato) |

## Evidenza dal sabotaggio

| Comportamento | Mutazione | Test | Esito | Azione |
|---|---|---|---|---|
| Sync file mancante → not-found | `not-found` → `synced` in `removePackage`/`syncVersion` | `returns not-found for missing file` | rosso ✅ | KEEP |
| Rilevamento conflitti su scan | `hasConflict` sempre `false` | `marks packages involved in conflicts` | rosso ✅ | KEEP |
| Confronto versioni PyPI | `return diff` → `return -diff` in `compareVersions` | `compareVersions: a < b` | rosso ✅ | KEEP |
| Soglia unused confidence | `UNUSED_REPORT_THRESHOLD` 50 → 10 | `suppresses low-confidence unused reports` | rosso ✅ | KEEP |
| Bash setup script install | rimosso `pip install -r requirements.txt` | `bash script uses requirements.txt` | rosso ✅ | KEEP (mordono anche con `includes`) |
| Pin versione in requirements.txt | `==` → `>=` in `rewriteTxtRequirementVersion` | `syncVersion pins version` | rosso ✅ | KEEP (conferma survivor) |
| Parser output pip check | regex `has requirement` → `has req` | `parses version mismatch lines` | rosso ✅ | KEEP (conferma survivor) |

Tutte le mutazioni sono state ripristinate; `git diff` su `src/` pulito dopo ogni ciclo.

## Hardening post-prune

- **Eliminato** `packageInstaller.test.ts` (duplicato di `uvSpawn`); test consolidati in `uvSpawn.test.ts`.
- **Sharpened** `setupScriptGenerator.test.ts` (ordine step, shebang, `set -e`, indici linea).
- **RequirementsGenerator**: scanner reali su fixture FS invece di mock-on-mock.
- **Contract test** `versionChecker.checkPackage` con `fetch` finto (PyPI JSON, yanked filter, metadata).
- **Parser diretti**: `pyprojectParser.test.ts`, `setupPyParser.test.ts` (sostituiscono parzialmente cast su API private).
- **Helpers centralizzati**: `test/helpers/stubLogger.ts`, `stubContext.ts`, `registerVscodeMock.cjs` per unit runner Node.
- **Runner mirato**: `npm run test:grep -- "pattern" [file]` per cicli sabotaggio rapidi.

## Decisioni

### Tenere

- Tutti i 21 file test sopravvissuti al prune, con assert forti su: `requirementsSync`, `conflicts`, `version`, `confidence`, `importAnalyzer`, `usageEvidence`, `displayCompiler`, `depFileDiscovery`, parsers, `uvSpawn`.
- Evidenza: sabotaggio rosso su moduli ad alto rischio.

### Consolidare

- `packageInstaller.test.ts` → `uvSpawn.test.ts` (completato).
- Nome test duplicato `returns empty array for missing file` in pipfile/setupCfg: contesti parser diversi, OK.

### Eliminare

- `test/suite/packageInstaller.test.ts` — filename misleading, overlap `withUvGlobalArgs` (zero behaviour perso).

## Politica di coverage proposta

### Globale (unit scope — wired)

Misura post-prune su moduli caricati da `npm run test:unit`:

| Metrica | Misura | Soglia (`floor-1`) |
|---|---|---|
| Linee / statements | 80.84% | **79%** |
| Branch | 73.6% | **72%** |
| Funzioni | 82.47% | **81%** |

Config: [`c8.json`](c8.json). Comando: `npm run test:coverage:check`.

### Patch gate (wired)

- Script: [`scripts/check-patch-coverage.mjs`](scripts/check-patch-coverage.mjs) — nuovi file `src/` (diff `--diff-filter=A`) con report c8 ≥ **70%**.
- Esenzioni: UI/glue (`commands/`, `providers/`, `ui/`, …); `usageEvidence/*` ensemble; spawn/network (`pythonResolver`, `pypiTopLevelCache`).
- File nuovi in `modules/`, `utils/`, `services/` **senza** entry coverage → **fail** (non exempt silenzioso).
- CI: step in [`.github/workflows/test.yml`](.github/workflows/test.yml).
- Locale: `.\scripts\diff-coverage.ps1` (coverage + globale + patch).

### Aspettative risk-weighted

| Area | Aspettativa |
|---|---|
| `requirementsSync`, `conflicts`, `version`, `confidence`, `uvSpawn` | ≥85% linee, assert forti (sabotaggio confermato) |
| Parsers, import matcher, usageEvidence | Misura naturale unit (~75–95%) |
| `extension.ts`, webview, commands, providers | E2E futuro; non padding — gap noto |

## Piano in step (eseguito)

1. Inventario e classificazione (22 file, 131 test).
2. MOCHA_GREP + unit runner + vscode mock.
3. Sabotaggio 5 moduli + 2 conferme survivor.
4. Prune: merge uvSpawn, sharpen generatori.
5. c8 + soglie + patch gate in CI.
6. Hardening: helpers, contract tests, parser tests.
7. Report e README aggiornati.

**Scope B7:** solo extension layer — nessun audit FE/BE separato.

## Gap noti (non padding)

Senza test unit/E2E: `extension.ts`, `commandController`, handlers (ecc. `packageInstaller`), webview/sidebar, providers CodeLens/Hover, `cursorAiService`, `venvHealthChecker`, `snapshotManager`. Copertura E2E VS Code è costo alto; la policy evita falsi 100% globali.
