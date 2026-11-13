#!/bin/bash
# Persistent MDVR LAN on eth0 (192.168.31.100) — NM must not manage eth0.
set -e
if [ "$(id -u)" -ne 0 ]; then
  echo "Run: sudo $0"
  exit 1
fi

mkdir -p /etc/NetworkManager/conf.d
cat >/etc/NetworkManager/conf.d/99-mdvr-unmanage-eth0.conf <<'EOF'
[keyfile]
unmanaged-devices=interface-name:eth0
EOF

cat >/etc/systemd/network/10-eth0-mdvr.network <<'EOF'
[Match]
Name=eth0

[Network]
Address=192.168.31.100/24
ConfigureWithoutCarrier=yes
LinkLocalAddressing=ipv6
EOF

systemctl enable systemd-networkd
systemctl restart NetworkManager
systemctl restart systemd-networkd
sleep 2
networkctl renew eth0 2>/dev/null || true

echo "--- eth0 ---"
ip -4 addr show eth0
echo "--- ping MDVR ---"
ping -c 2 -W 2 192.168.31.156 || true
