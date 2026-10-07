# Security Sync & Password Management

Pull in the security fixes already merged on GitHub (commit f5ce02d) that lock down the staff directory and file access, then replace the shared placeholder password with a real password system — forced change on first login, partner-initiated resets, and a self-service forgot-password flow — before redeploying to production.

## Who it's for

Every partner and staff member who logs into the practice management app daily, every client using the client portal, and the managing partner who will act as the "help desk" for password resets at this 11-person firm. Indirectly, it protects the firm's client financial and AML data, which was exposed by the previously unauthenticated staff directory.

## Core features and experience

- **Security sync**: the endpoint that used to publicly list all staff emails and roles now requires login; a new public "login directory" powers the login screen with names/titles only (no emails, no roles). Client users can no longer pull another client's file by guessing an ID. Database indexes are added for performance.
- **Login rewrite**: the old click-your-name card picker is replaced with a standard email + password form.
- **Google OAuth button removed for now**: "Continue with Google" is taken off the login page. It let a user skip email+password entirely, which meant it could skip the forced password-change gate too — for an 11-person firm, the simplest correct fix is to remove that path rather than teach it about the gate. Everyone signs in with email + password.
- **Forced password change on first login**: every existing account — partners, staff, and client-portal users alike — is flagged to require a password change the next time that person logs in. Until they set a new password, nothing else in the app is usable.
- **Partner-initiated reset**: any partner can trigger a password reset for a staff member or a client-portal user and is shown a one-time temporary password to relay directly (phone/WhatsApp — this app has no email-sending capability).
- **Self-service "Forgot password"**: any user — staff or client — can request a reset. The system never reveals whether an email belongs to an account. A partner sees pending reset requests in Settings and relays the reset code to the person by phone/WhatsApp.
- **Reset codes** expire after 30 minutes, work once, and immediately sign the user out of every other active session when used.
- **Logout fix**: logging out now actually ends the session — closing a gap where a logged-out session kept working, and where an old password (like the placeholder `nn123456`) would otherwise still work after a reset.

## User flow

1. User opens the login page and types their email and password. There is no "Continue with Google" option and no name-picker.
2. If this is their first login since the rollout — whether they're a partner, staff, or a client-portal user — they're taken straight to a "set a new password" screen (minimum 10 characters) before they can use anything else.
3. From then on, normal email + password login goes straight to the dashboard (or the client portal, for client accounts).
4. If someone forgets their password, they use "Forgot password" and are told a partner will be in touch with a reset code — no email is sent.
5. A partner opens Settings, sees the pending request (or is asked directly), and relays a one-time code or temporary password over phone/WhatsApp.
6. The user enters the code, sets a new password, and is immediately signed out everywhere else — their old password stops working right away.
7. A partner can also proactively reset anyone's password at any time from Settings — staff or client — without waiting for a request.

## UI/UX feel

Keep the existing Dark Navy (#0a1128) / Gold (#D4AF37) branding and the current login card's look and typography, minus the Google button and the name-picker grid. The email/password form and the forced password-change screen should feel like a natural part of the same login experience, not a separate flow. The forced-change prompt should read as routine security hygiene ("For your security, please set a new password") rather than as an error or lockout.

## Implementation phases

**Phase 1 — MVP (built now)**
Sync the GitHub security fixes; rewrite the login page to email + password and remove the Google OAuth button; force a password change on every account's first login after rollout — partners, staff, and client-portal users alike; let partners reset any user's password (staff or client) and relay a one-time temporary password; add self-service forgot-password with partner-relayed reset codes (30-minute expiry, single use, kills other sessions, and invalidates the old password immediately); fix logout so it actually ends the session; confirm nothing else in the app still calls the old unauthenticated staff-list endpoint; redeploy to production.

Before this phase is considered done, the following must be checked against the live production URL (not just locally) and the results reported back:
- The staff-list endpoint rejects a request with no login token.
- The public login-directory endpoint responds with names/titles only — nothing that looks like a firm email address anywhere in its response.
- A seeded user can log in, is forced through the password-change screen, sets a new password, and their old password is rejected on the next login attempt.
If any of these don't hold on the live site, the deploy is not treated as complete.

**Phase 2 — Future (out of scope for now)**
Lock an account out (or slow it down) after repeated failed login attempts, and keep a simple audit trail of who reset whose password and when.

**Phase 3 — Future (out of scope for now)**
Move reset-code delivery off phone/WhatsApp onto real email or SMS once the firm wants that, and offer two-factor authentication for partners. Re-evaluate bringing back a Google sign-in option at that point, wired through the password-change gate properly.

## Assumptions

- "Production" refers to this app's existing live deployment, not a new custom domain setup.
- A temporary password or reset code is shown once to the partner handling it and isn't retained in plaintext anywhere afterward.
- New passwords must be at least 10 characters; no additional complexity rules (symbols, mixed case, etc.) unless requested later.
- The "pending reset requests" list a partner sees shows who asked and when, not a durable log of the reset code itself.
- No new visual design or branding assets are needed beyond removing the Google button and the name-picker grid from the existing login shell.
- Removing the Google OAuth button is a visible, user-facing change for anyone who previously used it — they'll need to use email + password instead (and go through the forced change if it's their first login since rollout).
