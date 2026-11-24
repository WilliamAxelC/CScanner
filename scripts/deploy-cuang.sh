#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
REMOTE_HOST="docker-host"
REMOTE_NGINX_DIR="/home/agent/orca/learnings/projects-cuang-dev"
REMOTE_HTML_DIR="${REMOTE_NGINX_DIR}/html/projects/cscanner"
CONTAINER_NAME="projects-cuang-nginx"

if [ ! -f "${DIST_DIR}/index.html" ]; then
  echo "Error: ${DIST_DIR}/index.html missing. Run 'pnpm build:web:cuang' first." >&2
  exit 1
fi
if [ ! -f "${DIST_DIR}/download/version.json" ]; then
  echo "Error: ${DIST_DIR}/download/version.json missing. Run 'node scripts/generate-download-page.mjs' first." >&2
  exit 1
fi

echo "==> Syncing dist/ to ${REMOTE_HOST}:${REMOTE_HTML_DIR}"
tar -C "${DIST_DIR}" -cf - . | ssh "${REMOTE_HOST}" "
  set -euo pipefail
  rm -rf '${REMOTE_HTML_DIR}'
  mkdir -p '${REMOTE_HTML_DIR}'
  tar -xf - -C '${REMOTE_HTML_DIR}'
  docker exec '${CONTAINER_NAME}' rm -rf /usr/share/nginx/html/projects/cscanner
  docker cp '${REMOTE_HTML_DIR}' '${CONTAINER_NAME}':/usr/share/nginx/html/projects/cscanner
"

echo "==> Updating ${REMOTE_NGINX_DIR}/nginx.conf and reloading ${CONTAINER_NAME}"
ssh "${REMOTE_HOST}" "
  set -euo pipefail
  cd '${REMOTE_NGINX_DIR}'
  if [ ! -f nginx.conf.bak-pre-cscanner ]; then
    cp nginx.conf nginx.conf.bak-pre-cscanner
  fi

  python3 - << 'PYEOF'
import re

with open('nginx.conf', 'r', encoding='utf-8') as f:
    conf = f.read()

cscanner_block = '''    # CScanner (Ad-free document scanner Web PWA + Android APK download)
    location = /projects/cscanner {
        return 301 /projects/cscanner/;
    }
    location = /projects/cscanner/download {
        return 301 /projects/cscanner/download/;
    }
    location ^~ /projects/cscanner/download/ {
        root   /usr/share/nginx/html;
        index  index.html;
        try_files \$uri \$uri/ =404;
        location ~ \\.apk\$ {
            types { application/vnd.android.package-archive apk; }
            add_header Content-Disposition \"attachment\";
            add_header Cache-Control \"no-cache\";
        }
    }
    location ^~ /projects/cscanner/ {
        root   /usr/share/nginx/html;
        index  index.html;
        try_files \$uri \$uri/ /projects/cscanner/index.html;
        location = /projects/cscanner/sw.js {
            add_header Cache-Control \"no-cache, no-store, must-revalidate\";
            add_header Service-Worker-Allowed \"/projects/cscanner/\";
        }
        location = /projects/cscanner/manifest.json {
            add_header Cache-Control \"no-cache\";
        }
    }'''

pattern = re.compile(
    r'    # CScanner \(Ad-free document scanner Web PWA \+ Android APK download\).*?\n    \}\n',
    re.DOTALL,
)
# Match until the outer closing brace of location ^~ /projects/cscanner/
marker_start = '    # CScanner (Ad-free document scanner Web PWA + Android APK download)'
marker_end = '    # AudioDiff Redirect /AudioDiff -> /AudioDiff/'
if marker_start in conf and marker_end in conf:
    pre = conf.split(marker_start)[0]
    post = marker_end + conf.split(marker_end, 1)[1]
    new_conf = pre + cscanner_block + '\n\n' + post
elif marker_end in conf:
    new_conf = conf.replace(marker_end, cscanner_block + '\n\n' + marker_end, 1)
else:
    raise RuntimeError('Could not locate AudioDiff anchor inside nginx.conf')

with open('nginx.conf', 'w', encoding='utf-8') as f:
    f.write(new_conf)
PYEOF

  docker cp nginx.conf '${CONTAINER_NAME}':/etc/nginx/conf.d/default.conf
  docker exec '${CONTAINER_NAME}' nginx -t
  docker exec '${CONTAINER_NAME}' nginx -s reload
"

echo "==> Deployed CScanner to https://cuang.dev/projects/cscanner/ and https://cuang.dev/projects/cscanner/download/"
