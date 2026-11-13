# Security

Cube Crashers is a free, open-source game made in spare time. Security reports are welcome and taken
seriously; this page says how to send one and what to expect.

## Supported versions

Only the **latest release** gets security fixes. The desktop app updates itself; the dedicated server is
updated by downloading the new `cube-crashers-server.mjs` or pulling
`ghcr.io/dominikamann/cube-crashers-server:latest`.

| Version | Security fixes |
|---|---|
| Latest release | yes |
| Anything older | no: please update |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Write to **hello@amannlabs.eu** with "Cube Crashers security" in the subject, and include:

- what the problem is and what someone could do with it,
- the version, and whether it is the desktop app, the browser version or the dedicated server,
- the steps to reproduce it (a small proof of concept helps),
- whether and how you would like to be named in the fix's release notes.

What happens then:

- You get an answer within **7 days** saying whether the report is accepted.
- A confirmed problem is fixed in a new release as soon as is reasonably possible, the serious ones first.
- The release notes say what was fixed, and name you if you wish.
- Please give the fix time to reach players before you publish details: 90 days from your report, or the
  day the fixed release is out, whichever comes first.

## What is in scope

- The game itself: the desktop app (Electron), the browser version and the LAN protocol.
- The dedicated server (`cube-crashers-server.mjs`, the Docker image) and the list of public servers.
- The build and release files in this repository.

Not in scope:

- Problems that need a modified game on the victim's own computer, or physical access to it.
- Cheating in a game you host yourself: the host decides what happens in its game by design.
- Denial of service by sheer traffic against a server.
- Findings from automated scanners without a way to exploit them, and missing "best practice" headers
  without a concrete risk.
- Vulnerabilities in dependencies that cannot be reached through the game (they are updated regularly
  all the same).

## No bug bounty

There is **no bug bounty** and no payment of any kind for reports, however severe. This is a
non-commercial project; what it can offer is a quick fix and credit in the release notes.

## Testing in good faith

Test only against your own installation or your own server, never against other people's games or public
servers. Do not read, change or delete other people's data, and do not disturb running games. Research
done this way and reported as described here is welcome, and no legal steps will be taken over it.

## Safe use

- The game opens a LAN server only while you host a game. Do not forward its port to the internet unless
  you mean to run a public server; use the dedicated server for that.
- Download the game only from the [releases of this repository](https://github.com/dominikamann/cube-crashers/releases).
  The macOS app is signed and notarized; the Windows installer is not signed.
