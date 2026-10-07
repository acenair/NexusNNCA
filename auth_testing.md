# Authentication refactor verification

P0 is structural only. Preserve the existing bcrypt/JWT + MongoDB session contract;
do not implement the integration playbook's optional refresh tokens, cookies, rate
limits, or seeding changes in this refactor.

1. Read `memory/test_credentials.md`; never reset existing accounts to run tests.
2. Verify login, bearer and session-cookie authentication, `/auth/me`, logout,
   invalid credentials, and anonymous access rejection.
3. Verify forced password-change gating and partner/staff/client permissions.
4. Exercise password changes and reset flows only with disposable test users;
   record any created credentials and clean up test data afterward.
5. Verify startup preserves passwords, sessions, migration marker, and indexes.
6. Compare the complete OpenAPI schema and original handler bodies against
   `test_reports/p0_baseline/`. Request/response shapes must not change.