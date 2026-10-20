#!/bin/sh
# Самоподписанный сертификат для тестового стенда (для рабочего сервера нужен сертификат колледжа).
#   docker/nginx/self-signed-cert.sh [каталог] [имя сервера]
# По умолчанию: deploy/certs и localhost. Создаёт fullchain.pem и privkey.pem.
set -eu
dir="${1:-deploy/certs}"
host="${2:-localhost}"
mkdir -p "$dir"
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
  -keyout "$dir/privkey.pem" -out "$dir/fullchain.pem" \
  -subj "/CN=$host" -addext "subjectAltName=DNS:$host,DNS:localhost,IP:127.0.0.1" 2>/dev/null
# nginx в контейнере работает от UID 101 и должен прочитать ключ.
chmod 644 "$dir/fullchain.pem" "$dir/privkey.pem"
echo "Сертификат для $host: $dir/fullchain.pem, ключ: $dir/privkey.pem (действует 365 дней)"
