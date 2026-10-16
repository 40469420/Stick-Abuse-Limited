# WebHID website

The website reuses the desktop interface and GameSir protocol session, with a browser transport in place of node-hid. It is a beta. A real G7 Pro 8K connected successfully, reported firmware 0229 and active profile P1, and supplied a profile plus live stick/gyro data. Physical browser writes and reconnects still need validation.

## Run locally

```sh
npm ci
npm run web:build
npm run web:preview
```

Open `http://127.0.0.1:4193/Stick-Abuse-Limited/` in desktop Chrome or Edge. Close controller software, accept the terms and click **Connect controller**. The permission picker is browser-controlled. Only the GameSir vendor collection (VID `3537`, usage page `FFF0`, usage `40`, output report `0F`) is requested. Product IDs still identify model capabilities; unknown layouts cannot be written.

Supported browser paths: profile reads, verified profile writes with rollback, profile selection, sticks, device settings, triggers, gyro, center offsets, bindings, macros and community downloads. These use the same packet builders and codecs as desktop. Browser-specific compatibility remains subject to device and OS access restrictions.

Firmware, calibration, RC controls/background protections, native Labs, Steam export and Marius remain visible with **Download a local version to modify these settings**. PureRaw and PureRaw Deadzone (Processing) are hidden from website shape choices. PureRaw automatic reconnect recovery also requires desktop. The browser does not monitor games, run in a system tray, or promise protection after its tab is closed or suspended. A shared profile can contain settings from desktop-only sections; review it before use.

Writes save a rollback copy in this site's browser storage before starting. Storage failure refuses the write. Export your own backups through Profiles; browser storage is not a permanent backup. An interrupted write may require reconnecting and restoring a profile. Closing the browser is not a reset command. The WebHID permission can be revoked through browser site settings.

No controller reports or profile backups are sent to a server. GitHub requests load the public community collection and files. GitHub and the hosting provider see normal web request information, including IP addresses.

## GitHub Pages

Website changes live on the `webhid` branch, separately from desktop `main`. Deploy this branch without merging it into desktop main.

Enable **Settings → Pages → Source: GitHub Actions**. The `WebHID website` workflow builds and deploys `dist-web` when relevant files reach `webhid`, or when run manually. It does not build or publish a desktop release.

Default address: `https://40469420.github.io/Stick-Abuse-Limited/`.

The workflow uses Pages' base path automatically. For a custom domain, configure the domain in Pages, set its DNS records as documented by GitHub, then enforce HTTPS. WebHID requires a secure context. Permission grants and browser storage belong to the website origin, so a move to a different domain requires new permission and terms acceptance.

## Checks

`npm run test:web` runs fake-device tests without controller access. `npm run typecheck`, `npm test`, `npm run web:build` and `npm run build` cover shared/desktop regressions. Physical testing should connect and back up first, verify firmware and input, make one reversible setting change, read it back, then test reconnects. Mocked tests do not prove hardware compatibility.
