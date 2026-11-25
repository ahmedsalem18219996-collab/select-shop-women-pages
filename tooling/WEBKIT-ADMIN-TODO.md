# Admin Safari follow-up

Use `WEBKIT_ADMIN=1 npx playwright test --project=webkit-mobile --project=webkit-desktop` from `tooling` (`$env:WEBKIT_ADMIN = '1'` first in PowerShell). The CI WebKit job focuses on the customer campaign checkout. Chromium still runs the full suite.

- Visual Studio: use explicit WebP metadata for uploads. Investigate actionability waits on effect cards, close and save on Linux WebKit.
- Owner upload and publish: verify reordering, the visibility switch and the final publish with explicit scrolling. Distinguish hit-testing from actionability waits.
- Staff mobile draft: verify saving and the absence of publish controls on a physical iPhone. Explicit WebP metadata and scrolling passed locally.
- Motion settings: check save and clear-colour while switching the preview iframe. Explicit scrolling passed locally, but the Linux run timed out.
- Keep the other Studio cases, photo-encoding compatibility, order follow-up and ad reports available manually. They share the admin WebKit run while the CI job prioritizes the customer path.

Use normal input events and keep the assertions enabled when the cases return to CI.
