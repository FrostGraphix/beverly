# Announcement workflow audit — 2026-09-03

1. Compose tab — healthy. Compose and history are now separate keyboard-accessible tabs. The existing three-step broadcast flow remains intact.
2. History tab — healthy. Recent sends use compact, responsive cards and expose audience, date, delivery state, medium, and a clear View action.
3. History detail — healthy. Selecting a card opens the complete announcement in a focused modal; Escape closes it and focus returns to the originating card.
4. Account menu — healthy. The duplicate Security & 2FA entry is removed; the dedicated Security page remains available.
5. Beverly AI response formatting — healthy in automated verification. Provider and offline answers are normalized to remove filler and internal data labels; Markdown is rendered through an HTML-escaping shared formatter across admin, vendor, customer, and CRM widgets.

Evidence limit: no announcement was sent and no live AI-provider prompt was submitted during visual QA, avoiding new external messages. Those paths were verified through production builds, 357 backend tests, the wallet contract suite, and focused response-rendering tests.
