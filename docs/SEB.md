# Safe Exam Browser (SEB)

SEB is a free, open-source lockdown browser for Windows, macOS and iOS (safeexambrowser.org). While it runs:
- there are no other apps (unless you allow them),
- there is no task switching,
- there are **no browser extensions**,
- there is no copy-paste to or from outside,
- screen capture and virtual machines are blocked by default.

That covers the "extensions / AI overlays" problem much better than any web page can on its own.

## How the portal checks SEB

The **Config Key** is a 64-hex-character hash of your SEB settings. SEB proves it is running your exact config in two ways:
- **HTTP header:** `X-SafeExamBrowser-ConfigKeyHash = SHA256(full request URL + ConfigKey)` (lowercase hex).
- **JS API:** `SafeExamBrowser.security.configKey`, the same hash computed for the page URL. Newer macOS SEB builds can't send headers, so the client forwards this one as `X-SEB-Page-Url` / `X-SEB-Page-Hash`.

`server/src/middleware/seb.js` accepts either one when it matches one of the contest's `sebConfigKeys`.

| Contest setting | Effect |
|---|---|
| `SEB_REQUIRED` + key(s) set | Only SEB with your exact config can start or open the paper. Others see install instructions in the lobby. |
| `SEB_REQUIRED`, no key set | Falls back to checking that the user agent is SEB. Weaker; only for setup. |
| `SEB_PREFERRED` | Any browser works. Non-SEB attempts are marked "no SEB" and get a NOT_SEB signal. |
| `ANY` | No SEB check. The in-browser detector, fullscreen enforcement and paste blocking still run. |

## Making the config (Windows SEB Config Tool, about 10 minutes)

1. Install SEB on an organiser's Windows PC and open **SEBConfigTool**.
2. **General**
   - Start URL: `https://contest.yourdomain.in/login`
   - Set an admin password so students can't edit the config.
   - Set a **quit password** so students can't simply close SEB. Proctors keep it.
3. **Browser**
   - Allow the page to navigate inside your domain.
   - Disable "open new windows".
4. **Network → Filter**
   - Enable URL filtering and allow only `contest.yourdomain.in/*` (plus `safeexambrowser.org` if you want).
5. **Security**
   - Keep the defaults: no virtual machines, no screen capture, no Alt-Tab.
   - "Allow to switch to third party applications" stays **off**.
6. **Exam**
   - Enable "Use Browser Exam Key and Config Key".
   - Copy the **Config Key** shown there. It is 64 hex characters and changes whenever any setting changes, so copy it last.
7. Save as `codethon.seb`. Choose "Configuring a client" = *starting an exam*, not the client settings.
8. In the portal go to **Settings**:
   - paste the Config Key,
   - set policy `SEB_REQUIRED`,
   - upload `codethon.seb`.
9. Candidates open the lobby link in a normal browser and click **Open in Safe Exam Browser** (a `sebs://` link), or double-click the `.seb` file.

**Do this in the mock test, not on the day.** Confirm that a candidate in SEB can start and that Chrome is refused with "SEB_REQUIRED". If the key ever mismatches, the lobby says "wrong configuration". Re-copy the Config Key after your **last** settings change.

The exact UI labels differ a little between SEB versions. If you can't find the Config Key, check the SEB user manual for your version.

## Limits (tell the organisers honestly)

- **No Linux or Chromebook SEB.** Decide what those candidates do (use another device, or a separate `SEB_PREFERRED` contest with closer review).
- **A second device or a person in the room** can't be detected by any browser. Webcam proctoring is the next step if you need it (roadmap).
- **The header hash can be replayed** by a technical attacker who extracts it. Similarity checks and human review are the backstop.
