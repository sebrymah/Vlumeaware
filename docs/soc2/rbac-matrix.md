# Vlumeaware — RBAC authorization matrix

_Generated from the controllers by `api/scripts/rbac-matrix.mjs` on 2026-09-30. Do not hand-edit._

Legend: ✅ role allowed · — denied · 🔑 any authenticated user (no role gate) · 🌐 unauthenticated (`@Public`).
Unauthenticated rows are expected only for tracking, learning, portal, intake, signup, health and login endpoints; any other 🌐 row is a finding to review.

| Method | Route | Module | superadmin | clientAdmin | clientViewer |
|---|---|---|---|---|---|
| GET | `/audit-logs` | audit | ✅ | — | — |
| POST | `/auth/login` | auth | 🌐 | 🌐 | 🌐 |
| GET | `/auth/me` | auth | 🔑 | 🔑 | 🔑 |
| POST | `/auth/mfa/activate` | auth | ✅ | ✅ | ✅ |
| POST | `/auth/mfa/disable` | auth | — | ✅ | ✅ |
| POST | `/auth/mfa/setup` | auth | ✅ | ✅ | ✅ |
| POST | `/auth/mfa/verify` | auth | 🌐 | 🌐 | 🌐 |
| POST | `/auth/password` | auth | ✅ | ✅ | ✅ |
| GET | `/health` | — | 🌐 | 🌐 | 🌐 |
| GET | `/health/mailer` | — | ✅ | — | — |
| POST | `/intake/phish-report` | intake | 🌐 | 🌐 | 🌐 |
| GET | `/learn/:token` | training | 🌐 | 🌐 | 🌐 |
| POST | `/learn/:token/complete` | training | 🌐 | 🌐 | 🌐 |
| POST | `/learn/:token/quiz` | training | 🌐 | 🌐 | 🌐 |
| GET | `/phishing-templates` | templates | ✅ | ✅ | ✅ |
| POST | `/phishing-templates` | templates | ✅ | — | — |
| DELETE | `/phishing-templates/:templateId` | templates | ✅ | — | — |
| GET | `/phishing-templates/:templateId` | templates | ✅ | ✅ | ✅ |
| PATCH | `/phishing-templates/:templateId` | templates | ✅ | — | — |
| GET | `/phishing-templates/categories` | templates | ✅ | ✅ | ✅ |
| GET | `/phishing-templates/industries` | templates | ✅ | ✅ | ✅ |
| GET | `/portal/:token/summary` | portal | 🌐 | 🌐 | 🌐 |
| POST | `/portal/request-link` | portal | 🌐 | 🌐 | 🌐 |
| GET | `/shared-quizzes` | shared-quizzes | ✅ | ✅ | ✅ |
| POST | `/shared-quizzes` | shared-quizzes | ✅ | — | — |
| DELETE | `/shared-quizzes/:id` | shared-quizzes | ✅ | — | — |
| GET | `/shared-quizzes/:id` | shared-quizzes | ✅ | ✅ | ✅ |
| PATCH | `/shared-quizzes/:id` | shared-quizzes | ✅ | — | — |
| GET | `/shared-training-modules` | shared-modules | ✅ | ✅ | ✅ |
| DELETE | `/shared-training-modules/:id` | shared-modules | ✅ | — | — |
| PATCH | `/shared-training-modules/:id` | shared-modules | ✅ | — | — |
| GET | `/shared-training-modules/integrity` | shared-modules | 🔑 | 🔑 | 🔑 |
| POST | `/shared-training-modules/link` | shared-modules | ✅ | — | — |
| POST | `/signup` | signup | 🌐 | 🌐 | 🌐 |
| GET | `/tenants` | tenants | ✅ | — | — |
| POST | `/tenants` | tenants | ✅ | — | — |
| DELETE | `/tenants/:tenantId` | tenants | ✅ | — | — |
| GET | `/tenants/:tenantId` | tenants | ✅ | — | — |
| GET | `/tenants/:tenantId/allowlist` | tenants | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/allowlist/probe` | tenants | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/approve` | tenants | ✅ | — | — |
| GET | `/tenants/:tenantId/audit-log` | tenants | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/branding` | tenants | ✅ | ✅ | — |
| PATCH | `/tenants/:tenantId/branding` | tenants | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/campaigns` | campaigns | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/campaigns` | campaigns | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/campaigns/:campaignId` | campaigns | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/campaigns/:campaignId/kill` | campaigns | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/campaigns/:campaignId/launch` | campaigns | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/campaigns/:campaignId/pause` | campaigns | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/campaigns/:campaignId/preflight` | campaigns | ✅ | ✅ | ✅ |
| GET | `/tenants/:tenantId/campaigns/:campaignId/recipients` | campaigns | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/campaigns/:campaignId/resume` | campaigns | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/campaigns/:campaignId/schedule` | campaigns | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/certificates` | certificates | ✅ | ✅ | ✅ |
| GET | `/tenants/:tenantId/certificates/:certId` | certificates | ✅ | ✅ | ✅ |
| GET | `/tenants/:tenantId/certificates/:certId/pdf` | certificates | ✅ | ✅ | ✅ |
| PATCH | `/tenants/:tenantId/deliverability` | tenants | ✅ | — | — |
| PATCH | `/tenants/:tenantId/digest` | tenants | ✅ | — | — |
| GET | `/tenants/:tenantId/domains` | domains | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/domains` | domains | ✅ | ✅ | — |
| DELETE | `/tenants/:tenantId/domains/:domainId` | domains | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/domains/:domainId/verify` | domains | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/employees` | employees | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/employees` | employees | ✅ | ✅ | — |
| DELETE | `/tenants/:tenantId/employees/:employeeId` | employees | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/employees/repeat-clickers` | employees | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/employees/repeat-clickers/enrol` | employees | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/employees/risk` | employees | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/employees/risk/advice` | employees | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/employees/risk/export.csv` | employees | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/employees/risk/report.pdf` | employees | ✅ | ✅ | ✅ |
| GET | `/tenants/:tenantId/landing-pages` | landing-pages | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/landing-pages` | landing-pages | ✅ | ✅ | — |
| DELETE | `/tenants/:tenantId/landing-pages/:id` | landing-pages | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/landing-pages/preview` | landing-pages | ✅ | ✅ | — |
| PATCH | `/tenants/:tenantId/license` | tenants | ✅ | — | — |
| GET | `/tenants/:tenantId/license/keys` | licenses | ✅ | — | — |
| POST | `/tenants/:tenantId/license/keys` | licenses | ✅ | — | — |
| DELETE | `/tenants/:tenantId/license/keys/:tokenId` | licenses | ✅ | — | — |
| POST | `/tenants/:tenantId/license/redeem` | licenses | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/phish-reports` | intake | ✅ | ✅ | ✅ |
| GET | `/tenants/:tenantId/quizzes` | quizzes | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/quizzes` | quizzes | ✅ | ✅ | — |
| DELETE | `/tenants/:tenantId/quizzes/:quizId` | quizzes | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/quizzes/:quizId` | quizzes | ✅ | ✅ | ✅ |
| PATCH | `/tenants/:tenantId/quizzes/:quizId` | quizzes | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/quizzes/:quizId/questions` | quizzes | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/quizzes/:quizId/results` | quizzes | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/quizzes/from-shared/:sharedQuizId` | quizzes | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/readiness` | tenants | ✅ | ✅ | ✅ |
| GET | `/tenants/:tenantId/reports/:campaignId` | reports | ✅ | ✅ | ✅ |
| GET | `/tenants/:tenantId/reports/:campaignId/export.csv` | reports | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/reports/:campaignId/generate` | reports | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/reports/trend` | reports | ✅ | ✅ | ✅ |
| GET | `/tenants/:tenantId/routing-rules` | training | ✅ | ✅ | ✅ |
| DELETE | `/tenants/:tenantId/routing-rules/:scenarioId` | training | ✅ | ✅ | — |
| PUT | `/tenants/:tenantId/routing-rules/:scenarioId` | training | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/scenarios` | scenarios | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/scenarios` | scenarios | ✅ | ✅ | — |
| DELETE | `/tenants/:tenantId/scenarios/:scenarioId` | scenarios | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/scenarios/:scenarioId` | scenarios | ✅ | ✅ | ✅ |
| PATCH | `/tenants/:tenantId/scenarios/:scenarioId` | scenarios | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/scenarios/from-template/:templateId` | templates | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/scenarios/generate` | scenarios | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/scenarios/preview` | scenarios | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/seats` | tenants | ✅ | ✅ | ✅ |
| GET | `/tenants/:tenantId/security` | tenants | ✅ | ✅ | — |
| PATCH | `/tenants/:tenantId/security` | tenants | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/sending-domains` | sending-domains | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/sending-domains` | sending-domains | ✅ | ✅ | — |
| DELETE | `/tenants/:tenantId/sending-domains/:id` | sending-domains | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/sending-domains/:id/refresh` | sending-domains | ✅ | ✅ | — |
| PUT | `/tenants/:tenantId/sending-domains/:id/sender-name` | sending-domains | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/sending-domains/shared` | sending-domains | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/sending-domains/shared` | sending-domains | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/sending-domains/verified` | sending-domains | ✅ | ✅ | ✅ |
| PATCH | `/tenants/:tenantId/status` | tenants | ✅ | — | — |
| GET | `/tenants/:tenantId/training-assignments` | training | ✅ | ✅ | ✅ |
| POST | `/tenants/:tenantId/training-assignments` | training | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/training-assignments/:assignmentId/complete` | training | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/training-modules` | training-modules | ✅ | ✅ | ✅ |
| DELETE | `/tenants/:tenantId/training-modules/:moduleId` | training-modules | — | ✅ | — |
| PATCH | `/tenants/:tenantId/training-modules/:moduleId` | training-modules | — | ✅ | — |
| PUT | `/tenants/:tenantId/training-modules/:moduleId/quiz` | training-modules | ✅ | ✅ | — |
| POST | `/tenants/:tenantId/training-modules/from-shared/:sharedId` | training-modules | — | ✅ | — |
| POST | `/tenants/:tenantId/training-modules/link` | training-modules | — | ✅ | — |
| POST | `/tenants/:tenantId/training/assign` | training | ✅ | ✅ | — |
| GET | `/tenants/:tenantId/trial` | tenants | ✅ | ✅ | ✅ |
| GET | `/tenants/:tenantId/users` | tenants | ✅ | — | — |
| POST | `/tenants/:tenantId/users` | tenants | ✅ | — | — |
| POST | `/tenants/:tenantId/users/:userId/unlock` | tenants | ✅ | ✅ | — |
| GET | `/tenants/overview` | tenants | ✅ | — | — |
| GET | `/tenants/pending-signups` | tenants | ✅ | — | — |
| GET | `/track/allowlist/:token` | tracking | 🌐 | 🌐 | 🌐 |
| GET | `/track/branding/:token` | tracking | 🌐 | 🌐 | 🌐 |
| GET | `/track/click/:token` | tracking | 🌐 | 🌐 | 🌐 |
| GET | `/track/moment/:token` | tracking | 🌐 | 🌐 | 🌐 |
| GET | `/track/open/:token` | tracking | 🌐 | 🌐 | 🌐 |
| GET | `/track/quiz/:token` | tracking | 🌐 | 🌐 | 🌐 |
| POST | `/track/quiz/:token` | tracking | 🌐 | 🌐 | 🌐 |
| POST | `/track/report/:token` | tracking | 🌐 | 🌐 | 🌐 |
| POST | `/track/submit/:token` | tracking | 🌐 | 🌐 | 🌐 |
| GET | `/verify/:serial` | certificates | 🌐 | 🌐 | 🌐 |
| GET | `/verify/:serial/pdf` | certificates | 🌐 | 🌐 | 🌐 |

Total handlers: 145. Unauthenticated (`@Public`): 21.

## Unauthenticated (`@Public`) endpoints — review these deliberately

- POST `/auth/login` (auth)
- POST `/auth/mfa/verify` (auth)
- GET `/health` (—)
- POST `/intake/phish-report` (intake)
- GET `/learn/:token` (training)
- POST `/learn/:token/complete` (training)
- POST `/learn/:token/quiz` (training)
- GET `/portal/:token/summary` (portal)
- POST `/portal/request-link` (portal)
- POST `/signup` (signup)
- GET `/track/allowlist/:token` (tracking)
- GET `/track/branding/:token` (tracking)
- GET `/track/click/:token` (tracking)
- GET `/track/moment/:token` (tracking)
- GET `/track/open/:token` (tracking)
- GET `/track/quiz/:token` (tracking)
- POST `/track/quiz/:token` (tracking)
- POST `/track/report/:token` (tracking)
- POST `/track/submit/:token` (tracking)
- GET `/verify/:serial` (certificates)
- GET `/verify/:serial/pdf` (certificates)
