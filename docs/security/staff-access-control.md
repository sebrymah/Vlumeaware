# Staff access control — what the platform implements

Scope: Vlumetech (`vlumetech_superadmin`) accounts and the platform-wide security
policy. This is the evidence an ISO 27001 auditor asks for under Annex A.9 (access
control) and A.12.4 (logging and monitoring), and it names where each control lives
so the answer is checkable rather than asserted.

## Controls and where they live

| Control | What the platform does | Where |
|---|---|---|
| **A.9.1.1 Access control policy** | A stated platform policy — staff MFA, password minimum, session length — that an administrator edits in the console and that the API enforces | `platform_security_policy` table; `api/src/modules/platform/platform-policy.service.ts`; console **Staff & access** |
| **A.9.2.1 Registration of users** | Accounts are created by an existing administrator by email invitation; the new account holds a random, unknowable hash until the invitee sets a password | `POST /platform/staff`; `staff-users.service.ts` |
| **A.9.2.1 Credential issuance** | No administrator sets or sees another person's password — the one-time link is the only way in | `console-invite.service.ts` (`scope: 'staff'`); `/invite/<token>` |
| **A.9.2.2 Privilege management** | Every platform route is `vlumetech_superadmin`; client roles cannot reach any of it. Creating an account is audited with the role that was granted | `platform.controller.ts`; `audit_logs` (`platform.staff.create`) |
| **A.9.2.3 Removal of access** | Deactivation withdraws sign-in immediately — the JWT strategy re-reads the account on every request, so a live token stops working on the next call. The row is kept so the audit trail still resolves it | `POST /platform/staff/:id/deactivate`; `jwt.strategy.ts` |
| **A.9.2.4 Secret authentication information** | Staff MFA is required by policy; a lost authenticator is recovered by **Reset MFA**, which clears the secret and forces re-enrolment rather than sharing one | `POST /platform/staff/:id/mfa-reset`; `mfa-enforced.guard.ts` |
| **A.9.2.5 Review of access rights** | The staff list shows role, MFA state, status and **last sign-in**, so an access review is a read of one screen | `GET /platform/staff`; console **Staff & access** |
| **A.9.4.1 Information access restriction** | The tenant guard confines client data; staff routes that act across tenants are logged | `tenant-guard.extension.ts`; `audit.service.ts` |
| **A.9.4.2 Secure log-on** | Password + TOTP for staff; lockout after five failures for fifteen minutes; sessions expire per the platform policy | `auth.service.ts`; `platform_security_policy.session_timeout_minutes` |
| **A.12.4.1 Event logging** | Staff account creation, password reset, MFA reset, deactivation and reactivation are recorded with the actor | `audit_logs` — `platform.staff.*` |
| **A.12.4.3 Administrator logs** | The same log is readable in the console audit page, filtered by action | `/super-admin/audit` |

## Guards that prevent self-lockout

- You cannot deactivate your own account.
- The last active administrator cannot be deactivated.
- There is no route that deletes a staff account: removal is deactivation, so the
  audit trail keeps resolving the actor.

## Known gaps, stated rather than hidden

- **One staff role.** `StaffRole` has a single value, so "least privilege" currently
  means *staff versus client*, not *administrator versus analyst*. A read-only staff
  role is the next step if the team grows.
- **No automated access review reminder.** The data is there (last sign-in, status);
  the periodic review is a manual process.
- **No IP allow-list or device binding** for staff sessions.
- **MFA recovery is administrator-mediated.** There is no self-service recovery code
  path, which is deliberate for a staff account but should be revisited if the team
  becomes distributed across time zones.
