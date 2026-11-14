# A free Cube Crashers server on Oracle Cloud

Oracle Cloud's **Always Free** tier gives you small servers that cost nothing, for as long as you use them.
One of them is plenty for a Cube Crashers server, and it is online day and night without your own computer
running. All in the browser, no command line needed; about 20 minutes, most of it waiting.

What you end up with: a server with a fixed internet address that players add under **Online
Multiplayer → Add a server**, that updates itself to every new version of the game, and that can go into the
shared server list everyone sees.

## 1. Make an account

Sign up at [cloud.oracle.com](https://cloud.oracle.com). Oracle asks for a credit card to check who you are;
the Always Free servers below are not charged.

**Pick your home region with care: it cannot be changed later, and the free servers only exist there.**
Take the one closest to your players (Frankfurt for Germany, Amsterdam, Stockholm, Zurich, London, …).

## 2. Create the server

In the console: **☰ → Compute → Instances → Create instance**.

- **Name**: e.g. `cube-crashers`
- **Image**: *Change image* → **Canonical Ubuntu 24.04**
- **Shape**: *Change shape*, then one of the two labelled **Always Free-eligible**:
  - **Ampere → VM.Standard.A1.Flex**, 1 or 2 OCPUs: the roomy one, enough for several servers side by side.
    It is popular: if Oracle answers *Out of host capacity*, pick another *Availability domain* at the top, or
    try again later (it often takes a few tries).
  - **Specialty and previous generation → VM.Standard.E2.1.Micro**: small (1 GB), but almost always
    available. One server with 4 bots and monster hordes runs fine on it.
- **Networking**: keep *Create new virtual cloud network* and **Assign a public IPv4 address**.
- **Add SSH keys**: *Generate a key pair for me* and save the private key. You will not need it for this
  guide, but it is the only way into the server later.
- **Show advanced options → Management → Initialization script → Paste cloud-init script**: paste the
  script below and change the line `SERVER=…` to the server you want (all options are in the
  [README](../README.md#run-your-own-server)).

```bash
#!/bin/bash
# Cube Crashers server on Oracle Cloud (Ubuntu 24.04): installs Docker, opens the game port,
# runs the server and keeps it on the newest version.
set -eux

# your server: every option from the README works here
SERVER='--name "My Cube Crashers Server" --mode discovery --monsters --bots 4 --difficulty low --compress'
PORT=47800

# a little swap: helps the 1 GB micro server
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

apt-get update
apt-get install -y docker.io
systemctl enable --now docker

# Oracle's Ubuntu lets nothing in but SSH: open the game port
iptables -I INPUT 6 -m state --state NEW -p tcp --dport $PORT -j ACCEPT
netfilter-persistent save

# start the server, and again whenever there is a new version (checked every 15 minutes)
cat > /usr/local/bin/cube-crashers-up <<EOF
#!/bin/bash
IMAGE=ghcr.io/dominikamann/cube-crashers-server:latest
docker pull -q \$IMAGE >/dev/null
[ "\$(docker inspect -f '{{.Image}}' cube-crashers 2>/dev/null)" = "\$(docker image inspect -f '{{.Id}}' \$IMAGE)" ] && exit 0
docker rm -f cube-crashers >/dev/null 2>&1
docker run -d --name cube-crashers --restart unless-stopped -p $PORT:$PORT \$IMAGE --port $PORT $SERVER
EOF
chmod +x /usr/local/bin/cube-crashers-up
/usr/local/bin/cube-crashers-up
echo '*/15 * * * * root /usr/local/bin/cube-crashers-up' > /etc/cron.d/cube-crashers
```

Click **Create**. After a minute the instance is *Running*; note its **Public IP address**.

## 3. Open the port

The server lets the game in (the script did that), but Oracle's network in front of it does not yet:

On the instance page: **Subnet** link → **Security Lists** → *Default Security List…* → **Add Ingress
Rules**:

| Field | Value |
|---|---|
| Source CIDR | `0.0.0.0/0` |
| IP Protocol | TCP |
| Destination Port Range | `47800` |

## 4. Play

Give the server five minutes to set itself up (on the micro server up to ten), then in the game:
**Online Multiplayer → Add a server** → the public IP. It shows up with its name, mode and players.

Nothing happening after ten minutes? Check the security list rule from step 3 first. To look inside, connect
with the key from step 2: `ssh -i <key> ubuntu@<ip>`, then `sudo docker logs cube-crashers` or
`sudo tail -50 /var/log/cloud-init-output.log`.

## 5. Get into the official server list

Open a pull request that adds your server to [`servers.json`](../servers.json); on GitHub that is the pencil
icon on the file, no git needed:

```json
{ "name": "My Cube Crashers Server", "address": "203.0.113.7:47800" }
```

Once it is merged, every game lists it the next time **Online Multiplayer** is opened. The address stays
the same as long as the instance exists, also when it is stopped and started again.

## Good to know

- **Idle servers**: on a free account Oracle may stop an instance that does next to nothing for a week
  (an empty game server can look like that). It is only stopped, not deleted: start it again in the
  console. Upgrading the account to **Pay As You Go** ends this; the Always Free resources stay free.
- **Staying at zero**: under *Billing & Cost Management → Budgets* create a budget of 1 with an alert to your
  e-mail, so you hear of it if anything ever costs money.
- **More servers on one machine**: an A1 instance has room for several, each on its own port
  (`--port 47801`, …): a second `docker run` line in the script and a second port in steps 2 and 3.
- **`--compress`** (in the script above) cuts what the server sends to a fraction: on the 1 GB micro server
  a versus match with 4 bots went from about 170 KB/s to 12 KB/s per player, still at full speed and with
  the processor mostly idle. Leave it on.
