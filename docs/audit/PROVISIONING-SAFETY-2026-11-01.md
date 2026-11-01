# Provisioning safety review — 2026-11-01

Scope: offline inspection and focused provisioning changes before the separately authorized creation of 20 staging accounts. No Supabase connection, account creation, cloud data change, migration/reset/seed command, `.env` access/change, or key rotation was performed. Tests used temporary local files, mocked Auth requests and the existing local database fixtures.

## Findings and changes

| Finding | Resolution |
| --- | --- |
| Suspected `awaithandle.close()` typo | Not present. The actual file already used `await handle.close()`. No syntax correction was needed. |
| A failed close in `save()` cleanup could prevent temporary-file removal. A failed exclusive open could cause cleanup to remove a path the writer had not created. | Nested cleanup ensures removal is attempted even if closing fails; ownership is recorded only after a successful exclusive open. |
| Failure while initializing the reserved credential file could leave incomplete JSON. | Close and remove the failed reservation before returning an error. No Auth creation has occurred at this point. |
| Manifest validation accepted invalid false/empty employee IDs for nonemployee roles and ignored false/empty display names. | Validate supplied values explicitly. Malformed JSON errors now use a fixed message instead of echoing file contents. |
| Missing/mismatched employee database records were detected only when a later profile write hit a foreign-key constraint, after Auth creation. | Read and validate all 18 employee IDs before creating credential files or Auth accounts. Resolve all internal identities before writes as well. |
| New Auth responses were trusted without checking the identity, confirmation or UUID ownership. | Check a valid UUID, matching confirmed email/phone and absence of that UUID in previously observed users/profiles before writing any profile. Stop on mismatch and retain credentials for operator recovery. |
| Bootstrap Admin profile and audit creation use separate requests. A failed audit write could be silently skipped on a later run because the profile already existed. | Before resuming with an existing Admin, require an existing bootstrap/account-update audit record for that profile. Missing evidence stops the run before credential files or accounts are created. No automatic audit fabrication or repair. |

Existing behavior retained: random passwords, trusted Admin API confirmed identities, private output outside the repository, exclusive output reservation, `0600` file permissions, full JSON replacement through a same-directory temporary file, file sync and directory sync on this platform, credentials persisted before each Auth creation, no password reset or account deletion, UUID/profile/phone matching on retries, and transactional nonbootstrap profile/audit writes through the existing RPC.

## Manifest verification

`scripts/accounts.staging.json` contains exactly **1 Admin, 1 Manager and 18 Employees**. Its 20 normalized phone identifiers are unique. Employee IDs are exactly **NV01–NV18**, matching `server/employees.cjs` and the records declared in `202610310002_employees.sql`; the manifest was not changed.

The reported remote state (0 Auth users, 0 profiles, 18 employees; migrations applied and configuration preflight ready) comes from the operator. It was **not independently queried** in this task. The new read-only employee check will run when provisioning is separately authorized. A count of 18 alone is not proof of the correct IDs.

## Files changed in this task

- `scripts/provision-lib.cjs`: stricter manifest checks, employee/Auth-response validators, credential cleanup.
- `scripts/provision.cjs`: sanitized JSON parsing, pre-write checks, Admin audit preflight and Auth-response validation.
- `tests/audit/provision.test.cjs`: 15 additional regression tests and updated local backend fixture.
- `tests/backend/demo-auth.test.cjs`: existing provisioning fixture now supplies the employee/audit reads; authentication behavior unchanged.
- `docs/audit/PROVISIONING-SAFETY-2026-11-01.md`: this report.

Earlier uncommitted SMS-free authentication/configuration work remains in the working tree. The above list describes this task only. No frontend, scheduling, approval, RLS, migration/schema, authentication runtime, manifest or `.env` changes were made here.

## Executed tests

| Command | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `node --test tests/audit/provision.test.cjs tests/backend/demo-auth.test.cjs tests/audit/staging-preflight.test.cjs` | 35 | 0 | 0 |
| `node --test tests/backend/*.test.cjs tests/audit/*.test.cjs` | 105 | 0 | 0 |

The focused tests are included in the full suite; do not add their counts together. Both final commands exited 0. `git diff --check` also passed. Logs: `/tmp/2ce-provision-focused.log` and `/tmp/2ce-provision-full.log` (temporary, not committed).

New coverage includes manifest/seed ID agreement, normalized duplicate numbers, invalid fields/JSON, handle closure, partial writes, sync/close/open failures, removal only of owned files, directory-sync failure after rename, missing database employees, invalid identity configuration, credential-write failure before Auth, invalid/reused Auth UUIDs, wrong/unconfirmed identities, lost Auth responses, bootstrap profile failure and bootstrap audit failure followed by retry. Existing tests still cover rename failure, output collisions, symlinked paths into the repository, 20 successful mocked identities, retry without password resets, nonbootstrap profile failures and mapping conflicts.

No live tests or browser tests were run for this CLI-only change. These results do not assert successful cloud provisioning.

## Readiness and remaining risks

Ready for a **separately authorized, single-operator staging provisioning attempt**, subject to its preflight checks. This task does not authorize or execute that attempt. For the account-only step, omit `--seed-week`; seeding is a separate data operation.

1. Supabase Auth creation and application profile persistence are not one transaction; bootstrap profile/audit persistence is also split. A timeout can occur after the server has accepted a write. The script stops, retains credentials and rejects detected orphan/mismatched identities or missing Admin audit evidence on retry. Recovery requires an operator to inspect the actual persisted state; it never automatically deletes users or resets passwords.
2. Credential files are a recovery ledger of **attempted new accounts**, not proof that every listed account was created. Keep files from failed attempts. A subsequent run skips completed accounts and does not reproduce their passwords; use a fresh output path without discarding earlier files.
3. Run only one provisioning process against this project at a time and avoid simultaneous account administration. Database/Auth uniqueness constraints remain the final guard, but there is no cross-machine provisioning lock. Concurrent external changes can still cause an interrupted run requiring recovery.
4. Use a private local directory outside the repository, controlled by the operator, for output. `0600` files protect against other ordinary local users; abrupt system failure or filesystem failure is not an unconditional durability guarantee. If a sync/cleanup error occurs, inspect the private output and actual account state before retrying.
5. An existing manually created Admin without a corresponding account audit record now stops preflight. This is deliberate: review and explicitly repair its history before continuing; the script does not invent historical actions.
6. Live acceptance of confirmed staging email identities and the actual remote employee IDs remain unverified here. Keep the existing mapping key stable; phone identifiers do not prove phone ownership.
