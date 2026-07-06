import { createHash } from "node:crypto";
const READINESS_VERSION = 1;
const READINESS_DIRECTORY = "/etc/saws";
const READINESS_FILE = `${READINESS_DIRECTORY}/host-readiness`;
export function getReadinessHash(config) {
    return createHash("sha256")
        .update(JSON.stringify({
        version: READINESS_VERSION,
        exposure: config.exposure,
        sshPort: config.sshPort,
        allowedTcpPorts: config.allowedTcpPorts,
    }))
        .digest("hex");
}
export function readinessCheckScript(config) {
    const hash = getReadinessHash(config);
    const configureCommand = `saws host configure ${config.name}`;
    return `expected=${shellQuote(hash)}
actual=$(cat ${shellQuote(READINESS_FILE)} 2>/dev/null || true)
if [ "$actual" != "$expected" ]; then
  echo ${shellQuote(`Host "${config.name}" is not configured for this deployment. Run: ${configureCommand}`)} >&2
  exit 78
fi
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo ${shellQuote(`Docker is not ready on host "${config.name}". Run: ${configureCommand}`)} >&2
  exit 78
fi
if ! systemctl is-active --quiet docker ||
   ! systemctl is-active --quiet fail2ban ||
   ! systemctl is-active --quiet ufw ||
   [ ! -r /etc/ssh/sshd_config.d/00-saws-hardening.conf ] ||
   [ ! -r /etc/sysctl.d/60-saws-hardening.conf ] ||
   [ ! -r /etc/apt/apt.conf.d/20auto-upgrades ]; then
  echo ${shellQuote(`Host "${config.name}" has drifted from the required security baseline. Run: ${configureCommand}`)} >&2
  exit 78
fi`;
}
export function readinessConfigureScript(config) {
    const applicationPorts = config.allowedTcpPorts.join(" ");
    const firewallPorts = [config.sshPort, ...config.allowedTcpPorts]
        .filter((port, index, ports) => ports.indexOf(port) === index)
        .join(" ");
    const hash = getReadinessHash(config);
    return `export DEBIAN_FRONTEND=noninteractive
deployment_user=${shellQuote(config.deploymentUser)}
if [ "$(uname -s)" != "Linux" ] || [ ! -r /etc/os-release ]; then
  echo "SAWS host configuration supports Debian and Ubuntu Linux only" >&2
  exit 1
fi
. /etc/os-release
case "\${ID:-}" in
  debian|ubuntu) ;;
  *)
    echo "SAWS host configuration does not support \${PRETTY_NAME:-this operating system}" >&2
    exit 1
    ;;
esac

apt-get update
apt-get install -y ca-certificates fail2ban ufw unattended-upgrades iptables-persistent
if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io
fi
systemctl enable --now docker
docker info >/dev/null

if ! id "$deployment_user" >/dev/null 2>&1; then
  echo "Deployment user $deployment_user does not exist" >&2
  exit 1
fi
if [ "$deployment_user" != root ]; then
  usermod -aG docker "$deployment_user"
fi

authorized_keys=$(getent passwd "$deployment_user" | cut -d: -f6)/.ssh/authorized_keys
if [ ! -s "$authorized_keys" ]; then
  echo "Refusing to disable SSH passwords: $authorized_keys is missing or empty" >&2
  exit 1
fi

install -d -m 0755 /etc/ssh/sshd_config.d
rm -f /etc/ssh/sshd_config.d/60-saws-hardening.conf
cat > /etc/ssh/sshd_config.d/00-saws-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
EOF
sshd -t
sshd -T | grep -qx 'passwordauthentication no'
sshd -T | grep -qx 'kbdinteractiveauthentication no'
sshd -T | grep -qx 'pubkeyauthentication yes'

cat > /etc/sysctl.d/60-saws-hardening.conf <<'EOF'
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0
net.ipv4.conf.all.rp_filter=1
net.ipv4.conf.default.rp_filter=1
net.ipv4.tcp_syncookies=1
net.ipv6.conf.all.accept_redirects=0
net.ipv6.conf.default.accept_redirects=0
EOF
sysctl --system >/dev/null

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
install -d -m 0755 /etc/fail2ban/jail.d
cat > /etc/fail2ban/jail.d/saws.conf <<EOF
[sshd]
enabled = true
port = ${config.sshPort}
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
for port in ${firewallPorts}; do
  ufw allow "$port/tcp"
done
ufw --force enable

external_interface=$(ip -4 route list default | awk 'NR == 1 { print $5 }')
if [ -z "$external_interface" ]; then
  echo "Could not determine the host's external network interface" >&2
  exit 1
fi
iptables -N DOCKER-USER 2>/dev/null || true
iptables -N SAWS-DOCKER 2>/dev/null || true
iptables -F SAWS-DOCKER
iptables -A SAWS-DOCKER -i "$external_interface" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
for port in ${applicationPorts}; do
  iptables -A SAWS-DOCKER -i "$external_interface" -p tcp -m conntrack --ctorigdstport "$port" -j ACCEPT
done
iptables -A SAWS-DOCKER -i "$external_interface" -j DROP
iptables -A SAWS-DOCKER -j RETURN
iptables -C DOCKER-USER -j SAWS-DOCKER 2>/dev/null || iptables -I DOCKER-USER 1 -j SAWS-DOCKER

if ip6tables -nL DOCKER-USER >/dev/null 2>&1; then
  external_interface6=$(ip -6 route list default | awk 'NR == 1 { print $5 }')
  if [ -n "$external_interface6" ]; then
    ip6tables -N SAWS-DOCKER 2>/dev/null || true
    ip6tables -F SAWS-DOCKER
    ip6tables -A SAWS-DOCKER -i "$external_interface6" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    for port in ${applicationPorts}; do
      ip6tables -A SAWS-DOCKER -i "$external_interface6" -p tcp -m conntrack --ctorigdstport "$port" -j ACCEPT
    done
    ip6tables -A SAWS-DOCKER -i "$external_interface6" -j DROP
    ip6tables -A SAWS-DOCKER -j RETURN
    ip6tables -C DOCKER-USER -j SAWS-DOCKER 2>/dev/null || ip6tables -I DOCKER-USER 1 -j SAWS-DOCKER
  fi
fi
netfilter-persistent save

systemctl reload ssh 2>/dev/null || systemctl reload sshd
install -d -m 0755 ${shellQuote(READINESS_DIRECTORY)}
printf '%s\\n' ${shellQuote(hash)} > ${shellQuote(READINESS_FILE)}
chmod 0644 ${shellQuote(READINESS_FILE)}
echo "SAWS host configuration complete"`;
}
function shellQuote(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}
