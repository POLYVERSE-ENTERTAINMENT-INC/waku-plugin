---
description: Log in to Waku via your browser (website OAuth).
---

Run `waku login`. It opens the Waku website in the browser to authenticate; on success it stores credentials at `~/.config/waku/auth.json` and the session auto-renews from then on. If the browser doesn't open, paste the printed URL manually. Verify with `waku whoami`.

If `waku` is not yet installed, the plugin's launcher / SessionStart hook installs it automatically on first use — just run the command.

$ARGUMENTS
