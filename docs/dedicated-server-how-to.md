# Dedicated server: how to

A dedicated server keeps a Cube Crashers match open for everyone, day and night: players find it under
**Online Multiplayer**, join and leave whenever they like, and bots fill the empty seats. It is a small
program without graphics; it needs no graphics card and little memory (about 30 MB for a versus server).

This page has two parts: what every server needs, wherever it runs, and then
[an example](#example-free-on-oracle-cloud) that gets one up for free on Oracle Cloud in about 20 minutes.

## What every server needs

**A computer that stays on.** A spare PC, a Raspberry Pi 4 or 5, a NAS with Docker, a rented server or a free
cloud instance. The server itself barely uses the processor; what counts is a steady connection, with
roughly 12 KB/s of upload per player when it runs with `--compress`.

**The server program**, one of three ways:

- **Docker** (recommended, updates by pulling the image):

  ```bash
  docker run -d --name cube-crashers -p 47800:47800 --restart unless-stopped \
    --log-opt max-size=5m --log-opt max-file=2 \
    ghcr.io/dominikamann/cube-crashers-server --name "My Server" --mode discovery --compress
  ```

- **Node.js 20 or newer**: download `cube-crashers-server.mjs` from the
  [latest release](https://github.com/dominikamann/cube-crashers/releases/latest) and run
  `node cube-crashers-server.mjs --name "My Server" --mode discovery --compress`.
- **From the source code**: `npm install`, then `npm run server -- --mode discovery`.

**What it plays.** `--mode` picks versus (`discovery` plays every rule in turn, or `gungame`, `capture`, …)
or co-op (`coop`, `quick`, `brawl`, `bossrush`, `endless`); `--map`, `--bots`, `--monsters`, `--difficulty`
and `--view` set the rest. Every option, the maps per mode and a config file are in the
[README](../README.md#run-your-own-server).

**An open port.** The server listens on TCP **47800** (`--port` changes it, one port per server). At home,
forward that port in your router to the computer running it; in a cloud, open it in the provider's firewall
too. Players on your own network can use its local address without any of that.

**The same version as the players.** A game only joins a server of its own version; the list says *other
version* otherwise. With Docker, pull `ghcr.io/dominikamann/cube-crashers-server:latest` again after a
release and restart the container (the Oracle example below does that by itself every 15 minutes); with
Node, download the new `cube-crashers-server.mjs`.

**Optional: browser players.** The browser version can only reach servers behind https. Start the server
with `--web` and put a TLS proxy such as Caddy in front of it, see
[Let players from the browser join](../README.md#let-players-from-the-browser-join).

**Optional: the shared server list.** Open a pull request that adds your server to
[`servers.json`](../servers.json); once it is merged, every game lists it. See
[step 5](#5-get-into-the-official-server-list) below.

**Safety.** The server keeps no names and no addresses; its log says only which match began when and with
how many players. Run it in a container or as a user without special rights, and open only the game port.

## Example: free on Oracle Cloud

Oracle Cloud's **Always Free** tier gives you small servers that cost nothing, for as long as you use them.
One of them is plenty for a Cube Crashers server, and it is online day and night without your own computer
running. All in the browser, no command line needed; about 20 minutes, most of it waiting.

What you end up with: a server with a fixed internet address that players add under **Online
Multiplayer → Add a server**, that updates itself to every new version of the game, and that can go into the
shared server list everyone sees.

### 1. Make an account

Sign up at [cloud.oracle.com](https://cloud.oracle.com). Oracle asks for a credit card to check who you are;
the Always Free servers below are not charged. (On upgrading to Pay As You Go, see *Good to know*, the bank
may show a hold of about 100 US dollars for a few days: a check, not a payment.)

**Pick your home region with care: it cannot be changed later, and the free servers only exist there.**
Take the one closest to your players (Frankfurt for Germany, Amsterdam, Stockholm, Zurich, London, …). A
server in another region is billed, even when it is the same size.

### 2. Create the server

In the console: **☰ → Compute → Instances → Create instance**.

- **Name**: e.g. `cube-crashers`
- **Image**: *Change image* → **Canonical Ubuntu 24.04**
- **Shape**: *Change shape*, then one of the two labelled **Always Free-eligible**:
  - **Specialty and previous generation → VM.Standard.E2.1.Micro** (recommended to start): small, 1 GB of
    memory and a share of a processor, but there whenever you ask. You may have two of them. One server
    with 4 bots and monster hordes runs on it at full speed with the processor mostly idle.
  - **Ampere → VM.Standard.A1.Flex**: the roomy one, with room for several servers side by side. Oracle
    hands out 4 OCPUs and 24 GB for free, newer accounts sometimes only 2 and 12 (see *Governance → Limits*).
    It is much sought after: in a busy region Oracle may answer *Out of host capacity* in every availability
    domain for hours or days. Then take a micro server now and try the A1 again later.
- **Networking**: keep *Create new virtual cloud network* and **Assign a public IPv4 address**.
- **Add SSH keys**: *Generate a key pair for me* and save the private key. You will not need it for this
  guide, but it is the only way into the server later.
- **Show advanced options → Management → Initialization script → Paste cloud-init script**: paste the
  script below and write your server into the lines between `SERVERS` and `SERVERS` (all options are in
  the [README](../README.md#run-your-own-server)).

```bash
#!/bin/bash
# Cube Crashers servers on Oracle Cloud (Ubuntu 24.04): installs Docker, opens the game ports,
# runs the servers and keeps them on the newest version.
set -eux

# your servers, one line each: a short name, its port (47800 to 47802), then its options.
# One server is the safe choice on a micro instance; two or three there are experimental.
cat > /etc/cube-crashers.conf <<'SERVERS'
versus  47800 --name "My Cube Crashers Server" --mode discovery --monsters --bots 4 --difficulty low --compress
SERVERS

# a little swap: helps the 1 GB micro instance
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

apt-get update
apt-get install -y docker.io
systemctl enable --now docker

# Oracle's Ubuntu lets nothing in but SSH: open the game ports
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 47800:47802 -j ACCEPT
netfilter-persistent save

# start every server, and again whenever there is a new version (checked every 15 minutes)
cat > /usr/local/bin/cube-crashers-up <<'UP'
#!/bin/bash
IMAGE=ghcr.io/dominikamann/cube-crashers-server:latest
docker pull -q $IMAGE >/dev/null
grep -v '^ *#' /etc/cube-crashers.conf | while read -r name port options; do
  [ -n "$name" ] || continue
  [ "$(docker inspect -f '{{.Image}}' cc-$name 2>/dev/null)" = "$(docker image inspect -f '{{.Id}}' $IMAGE)" ] && continue
  docker rm -f cc-$name >/dev/null 2>&1
  eval "docker run -d --name cc-$name --restart unless-stopped --log-opt max-size=5m --log-opt max-file=2 -p $port:$port $IMAGE --port $port $options"
done
UP
chmod +x /usr/local/bin/cube-crashers-up
/usr/local/bin/cube-crashers-up
echo '*/15 * * * * root /usr/local/bin/cube-crashers-up' > /etc/cron.d/cube-crashers
```

Click **Create**. After a minute the instance is *Running*; note its **Public IP address**.

### 3. Open the ports

The server lets the game in (the script did that), but Oracle's network in front of it does not yet:

On the instance page: **Subnet** link → **Security Lists** → *Default Security List…* → **Add Ingress
Rules**:

| Field | Value |
|---|---|
| Source CIDR | `0.0.0.0/0` |
| IP Protocol | TCP |
| Destination Port Range | `47800-47802` |

### 4. Play

Give the server time to set itself up: about five minutes on an A1, ten on a micro instance. Until then a
micro instance is busy installing and can be slow to answer even over SSH; do not judge its speed by that.
Then in the game: **Online Multiplayer → Add a server** → the public IP (for the ports after the first:
`<ip>:47801`, `<ip>:47802`). It shows up with its name, mode and players.

Nothing happening after ten minutes? Check the security list rule from step 3 first. To look inside, connect
with the key from step 2: `ssh -i <key> ubuntu@<ip>`, then `sudo docker ps`, `sudo docker logs cc-versus` or
`sudo tail -50 /var/log/cloud-init-output.log`.

**Changing a server later**: `sudo nano /etc/cube-crashers.conf`, then `sudo docker rm -f cc-<name>` and
`sudo cube-crashers-up` to start it with the new options (a new line just needs `sudo cube-crashers-up`).

### 5. Get into the official server list

Open a pull request that adds your server to [`servers.json`](../servers.json); on GitHub that is the pencil
icon on the file, no git needed. One entry per port:

```json
{ "name": "My Cube Crashers Server", "address": "203.0.113.7:47800" }
```

Once it is merged, every game lists it the next time **Online Multiplayer** is opened; GitHub keeps a copy
of the list for up to five minutes, so give it that long. The address stays the same as long as the
instance exists, also when it is stopped and started again.

### How much a micro instance carries

Measured on a VM.Standard.E2.1.Micro with `--compress`:

| What ran | Updates per second (30 is full speed) | Processor | Memory | Upload per player |
|---|---|---|---|---|
| Versus, 4 bots and monster hordes | 30 | about 5 % | about 30 MB | about 12 KB/s (170 KB/s without `--compress`) |
| Capture the Cube with 4 bots, a Boss Brawl and a Tower Run at the same time, one player each | 30 in Capture the Cube | 2 to 23 % per server | about 35 MB per server | 1 to 20 KB/s |

**Three servers on one micro instance are experimental**: they ran smoothly in these tests, but only with
one player on each. A micro instance gets a small share of a processor for sure and more only now and then,
so three busy servers at once may be too much for it. Start with one; if you add more, watch whether matches
stay smooth, and move them to an A1 instance when it gets tight.

### Good to know

- **Idle servers**: on a free account Oracle may stop an instance that does next to nothing for a week
  (an empty game server can look like that). It is only stopped, not deleted: start it again in the
  console. Upgrading the account to **Pay As You Go** ends this; the Always Free resources stay free.
- **Staying at zero**: under *Billing & Cost Management → Budgets* create a budget of 1 with an alert to your
  e-mail, so you hear of it if anything ever costs money. Oracle has no switch that stops everything at a
  limit; the budget only warns.
- **`--compress`** (in the script above) cuts what the server sends to a fraction for a little more
  processor time. Leave it on.
- **Safe by default**: the instance takes SSH only with your key, and only the game ports and SSH are open.
  The server runs in a container without special rights, and Ubuntu installs security updates by itself.
