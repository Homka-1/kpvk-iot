#!/usr/bin/env bash
# Автоматическая установка и обновление рабочего стенда (docker-compose.prod.yml + .env.prod).
# Запуск из любого каталога на сервере: scripts/deploy.sh [параметры].
# Недостающие параметры скрипт спрашивает после запуска; с --yes берёт значения по умолчанию.
# Порядок действий повторяет docs/deploy/install.md и docs/deploy/update.md.
set -euo pipefail

usage() {
  cat <<'EOF'
Использование: scripts/deploy.sh [параметры]

  --mode install|update   установка с нуля или обновление (по умолчанию: install, если нет .env.prod)
  --ref <метка|ветка>     версия кода из git (по умолчанию: текущая ветка с обновлением из origin)
  --version <метка>       метка образов IOT_VERSION (по умолчанию: ГГГГММДД-ЧЧММ-<коммит>)
  --host <имя>            имя сервера для самоподписанного сертификата (установка)
  --cert existing|self-signed
                          сертификат: уже лежит в TLS_CERT_DIR или создать самоподписанный (установка)
  --admin <логин>         логин первого администратора (установка, по умолчанию admin)
  --no-git                не обновлять код из git (установка из архива выпуска)
  --no-backup             не делать резервную копию перед обновлением (не рекомендуется)
  -y, --yes               не задавать вопросов, использовать значения по умолчанию
  -h, --help              эта справка
EOF
}

die() { echo "Ошибка: $*" >&2; exit 1; }
info() { echo "==> $*"; }

MODE='' REF='' VERSION='' HOST='' CERT='' ADMIN='' USE_GIT=1 BACKUP=1 ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="${2:?}"; shift 2 ;;
    --ref) REF="${2:?}"; shift 2 ;;
    --version) VERSION="${2:?}"; shift 2 ;;
    --host) HOST="${2:?}"; shift 2 ;;
    --cert) CERT="${2:?}"; shift 2 ;;
    --admin) ADMIN="${2:?}"; shift 2 ;;
    --no-git) USE_GIT=0; shift ;;
    --no-backup) BACKUP=0; shift ;;
    -y | --yes) ASSUME_YES=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "неизвестный параметр: $1" ;;
  esac
done

# ask <переменная> <вопрос> [значение по умолчанию] — спрашивает, только если переменная пуста.
ask() {
  local var="$1" prompt="$2" def="${3:-}" answer
  [ -n "${!var}" ] && return
  if [ "$ASSUME_YES" = 1 ] || [ ! -r /dev/tty ]; then
    [ -n "$def" ] || die "не задан обязательный параметр ($prompt)"
    printf -v "$var" '%s' "$def"
    return
  fi
  read -r -p "$prompt${def:+ [$def]}: " answer </dev/tty
  printf -v "$var" '%s' "${answer:-$def}"
  [ -n "${!var}" ] || die "не задан обязательный параметр ($prompt)"
}

confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  local answer
  read -r -p "$1 [y/N]: " answer </dev/tty
  [[ "$answer" =~ ^[YyДд] ]]
}

# set_env <ключ> <значение> — задаёт переменную в .env.prod (значения без пробелов и спецсимволов).
set_env() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    echo "$1=$2" >>"$ENV_FILE"
  fi
}
get_env() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

cd "$(dirname "$0")/.."
ENV_FILE=.env.prod

# Один запуск за раз: при автодеплое пуши подряд встают в очередь, а не обновляют стенд одновременно.
command -v flock >/dev/null || die "нужен flock (пакет util-linux)"
exec 9>.deploy.lock
flock -w 1800 9 || die "другой запуск deploy.sh не завершился за 30 минут"
export COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES="$ENV_FILE"

command -v docker >/dev/null || die "Docker не установлен"
docker compose version >/dev/null 2>&1 || die "нужен Docker Compose v2 (docker compose)"
command -v curl >/dev/null || die "нужен curl для проверки работоспособности"

[ -f "$ENV_FILE" ] && default_mode=update || default_mode=install
ask MODE "Режим (install/update)" "$default_mode"
case "$MODE" in
  install) [ ! -f "$ENV_FILE" ] || die "$ENV_FILE уже есть — это установленный стенд, используйте --mode update" ;;
  update) [ -f "$ENV_FILE" ] || die "нет $ENV_FILE — сначала установка (--mode install)" ;;
  *) die "режим должен быть install или update" ;;
esac

# 1. Резервная копия перед обновлением: до смены кода и образов.
if [ "$MODE" = update ] && [ "$BACKUP" = 1 ]; then
  if docker compose ps --status running --services | grep -qx backup; then
    info "Резервная копия перед обновлением"
    BACKUP_NAME="$(docker compose exec -T backup backup.sh | tail -n 1)"
    info "Копия: $BACKUP_NAME"
  else
    echo "Контейнер backup не запущен, резервную копию сделать нельзя."
    # Без вопросов (автодеплой) не обновляем без копии: решение принимает администратор.
    [ "$ASSUME_YES" = 0 ] || die "обновление без резервной копии отменено (явно: --no-backup)"
    confirm "Продолжить обновление без копии?" || die "обновление отменено"
  fi
fi

# 2. Код.
if [ "$USE_GIT" = 1 ] && [ -d .git ]; then
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "в рабочем каталоге есть незафиксированные изменения: git status"
  ask REF "Метка выпуска или ветка (Enter — текущая ветка)" "$(git rev-parse --abbrev-ref HEAD)"
  info "Получение кода: $REF"
  git remote | grep -qx origin && git fetch --tags origin
  git checkout -q "$REF"
  if git rev-parse -q --verify '@{upstream}' >/dev/null; then
    git merge --ff-only -q '@{upstream}'
  fi
  info "Версия кода: $(git log -1 --format='%h %s')"
  commit="-$(git rev-parse --short HEAD)"
else
  commit=''
fi

# 3. Переменные окружения и сертификат при установке.
if [ "$MODE" = install ]; then
  command -v openssl >/dev/null || die "нужен openssl для генерации секретов"
  info "Создание $ENV_FILE с новыми секретами"
  (umask 077 && cp .env.prod.example "$ENV_FILE")
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_env JWT_SECRET "$(openssl rand -hex 32)"
  echo "Сохраните копию $ENV_FILE в надёжном месте: без POSTGRES_PASSWORD не восстановить базу из тома."

  cert_dir="$(get_env TLS_CERT_DIR)"
  cert_dir="${cert_dir:-./deploy/certs}"
  if [ -f "$cert_dir/fullchain.pem" ] && [ -f "$cert_dir/privkey.pem" ]; then
    default_cert=existing
  else
    default_cert=self-signed
  fi
  ask CERT "Сертификат (existing — уже в $cert_dir, self-signed — самоподписанный для теста)" "$default_cert"
  case "$CERT" in
    existing)
      [ -f "$cert_dir/fullchain.pem" ] && [ -f "$cert_dir/privkey.pem" ] ||
        die "положите fullchain.pem и privkey.pem в $cert_dir (docs/deploy/install.md, шаг 2)"
      ;;
    self-signed)
      ask HOST "Имя сервера" "$(hostname -f 2>/dev/null || hostname)"
      docker/nginx/self-signed-cert.sh "$cert_dir" "$HOST"
      ;;
    *) die "сертификат: existing или self-signed" ;;
  esac
fi

PREV_VERSION=""
[ "$MODE" = update ] && PREV_VERSION="$(get_env IOT_VERSION)"
ask VERSION "Метка образов IOT_VERSION" "$(date +%Y%m%d-%H%M)$commit"
set_env IOT_VERSION "$VERSION"

# 4. Сборка и запуск; API применяет миграции при старте.
info "Сборка и запуск контейнеров (IOT_VERSION=$VERSION)"
if ! docker compose up -d --build --wait; then
  docker compose ps
  docker compose logs api --tail 50 || true
  if [ "$MODE" = update ]; then
    cat >&2 <<EOF

Обновление не удалось. Новые данные не потеряны, причина — в журнале выше.
Откат (docs/deploy/update.md, раздел «Откат»): вернуть прежний код (git checkout),
IOT_VERSION=$PREV_VERSION в $ENV_FILE, затем
  docker compose stop api
  docker compose exec backup restore.sh ${BACKUP_NAME:-<имя копии>}
  docker compose up -d --wait
EOF
  fi
  die "контейнеры не перешли в состояние healthy"
fi

# 5. Проверка снаружи, через nginx.
https_port="$(get_env HTTPS_PORT)"
health_url="https://localhost:${https_port:-443}/api/health"
info "Проверка $health_url"
curl -fsSk --retry 5 --retry-delay 2 --retry-all-errors "$health_url" >/dev/null ||
  die "API не отвечает на $health_url"

# 6. Первый администратор (временный пароль выводится один раз).
if [ "$MODE" = install ]; then
  ask ADMIN "Логин первого администратора" admin
  info "Создание администратора $ADMIN"
  docker compose exec -T api node dist/cli/create-admin.js "$ADMIN"
fi

# 7. Старые образы: оставляем текущую и прежнюю версию (для отката), остальные удаляем,
#    иначе автодеплой при каждом пуше заполняет диск.
if [ "$MODE" = update ]; then
  for repo in iot-api iot-web iot-backup; do
    docker image ls "$repo" --format '{{.Tag}}' |
      { grep -vxF -e "$VERSION" -e "${PREV_VERSION:-$VERSION}" || true; } |
      while read -r tag; do docker image rm "$repo:$tag" >/dev/null || true; done
  done
  docker builder prune -f --filter until=168h >/dev/null || true
fi

docker compose ps
info "Готово: $MODE, IOT_VERSION=$VERSION${PREV_VERSION:+ (было $PREV_VERSION)}"
