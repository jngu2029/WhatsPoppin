# Verification — 2026-10-04

- TypeScript: passed, strict mode.
- Crowd logic: 4 tests passed (freshness, agreement, scale mapping, distances).
- Django: all 25 tests passed, including 5 new API tests.
- Expo runtime dependencies are SDK-aligned. TypeScript 7 passes strict checks; SDK-recommended TypeScript 6 hit a compiler recursion error.
- Web production export: passed.
- Android and iOS JavaScript/Hermes exports: passed. These are bundle checks, not signed device builds.
- Local backend: migrations and fictional seed data loaded into opt-in SQLite; `/api/venues/` responds successfully.
- Browser flow checks: venue details/back, map/list, matching and empty search, quiet filter, save/unsave, area radius changes, report selection/submission/confirmation, immediate freshness update, profile history.
- Browser viewport checks: 320×740, 375×812, 414×896, 768×1024, and 812×375 landscape; root width matches viewport with no horizontal page scroll. Crowd filters scroll horizontally inside their own region.
- Browser error logs: empty during flow checks.
- Native motion uses the OS reduced-motion preference; web includes reduced-motion CSS. Focus rings and safe-area handling are implemented. Native accessibility, large system text, and actual device interaction still require device QA.
- Preview defaults to illustrative data; saved venues and reports persist locally. PostgreSQL remains the backend default unless `USE_SQLITE=1` is explicitly enabled.

Known release work: physical-device QA, standalone Android map key, store signing, production business data, account registration/recovery, and upstream Expo/Metro audit advisories. Development token auth is connected; deployed APIs require HTTPS.

Mobile demo revision (2026-10-05): browser canvas caps at 480 px, phones fill available width, compact landscape header retains visible list content. Rechecked 320/375/414/768 px and 812×375 with no page overflow. Native layouts continue to use physical device dimensions.

