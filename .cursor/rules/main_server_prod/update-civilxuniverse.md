## Инструкция: обновление CivilX.Universe через Docker

### 1. Область применения
- Описывает полный цикл обновления фронтенда CivilX.Universe (DataLab) на сервере `95.163.230.61`.
- Используется Docker-образ `ghcr.io/f1bonacci66/civilx-universe:<tag>`; **архивы не передаются**.
- Базовые команды уже реализованы в `civilx-website/universe/universe/update-server.ps1`; ниже фиксированы ключевые шаги и проверки.

### 2. Требования и подготовка
1. Рабочая станция: `C:\Projects\CivilX\Site\civilx-website\universe\universe`.
2. Docker Desktop запущен; `npm ci`, `npm run build` проходят успешно.  
   - `npm run lint` в Next.js 14.2 требует `eslint@^9`. Если при запуске lint появляется мастер установки ESLint 9 и команда падает, **не форсируйте установку**: достаточно, что `next build` выполняет lint внутри пайплайна.
3. Переменная `NEXT_PUBLIC_API_URL` должна быть установлена как относительный путь `/api/datalab` (НЕ использовать `https://api.civilx.ru/api/datalab`, так как это вызывает ошибку SSL сертификата `ERR_CERT_AUTHORITY_INVALID`). Относительный путь проксируется через Next.js route handler на бэкенд.
4. Переменная `GITHUB_TOKEN` (scope `read:packages` + `write:packages`) экспортирована в PowerShell.
5. Доступ к ключу `C:\Users\dimag\.ssh\Universe`.
6. Backend FastAPI (`/opt/civilx-backend`) запущен через systemd-сервис `civilx-backend` и слушает `0.0.0.0:8000`:  
   ```bash
   sudo systemctl status civilx-backend
   sudo ss -lntp | grep 8000
   ```

#### 2.1. INTERNAL_API_URL и docker-compose на сервере
- Файл `/opt/civilx-universe/.env` должен содержать строку `INTERNAL_API_URL=http://172.17.0.1:8000/api/datalab` (адрес хоста внутри docker bridge).
- В `/opt/civilx-universe/docker-compose.yml` переменная прокидывается в контейнер, а также прописан host-gateway:
  ```yaml
  environment:
    - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-/api/datalab}
    - INTERNAL_API_URL=${INTERNAL_API_URL:-http://172.17.0.1:8000/api/datalab}
    - DOCKER_CONTAINER=true
  extra_hosts:
    - host.docker.internal:host-gateway
  ```
- При изменениях `docker-compose` обязательно выполнять `docker-compose down && docker-compose up -d --remove-orphans`.

### 3. Сборка и публикация образа
**ВАЖНО**: При сборке Docker-образа обязательно используйте `--build-arg NEXT_PUBLIC_API_URL=/api/datalab` (относительный путь). НЕ используйте `https://api.civilx.ru/api/datalab`, так как это вызывает ошибку SSL сертификата.

```powershell
PS C:\Projects\CivilX\Site\civilx-website\universe\universe> docker build --build-arg NEXT_PUBLIC_API_URL=/api/datalab -t ghcr.io/f1bonacci66/civilx-universe:<tag> -t ghcr.io/f1bonacci66/civilx-universe:latest .
PS ...> echo $Env:GITHUB_TOKEN | docker login ghcr.io -u f1bonacci66 --password-stdin
PS ...> docker push ghcr.io/f1bonacci66/civilx-universe:<tag>
PS ...> docker push ghcr.io/f1bonacci66/civilx-universe:latest
```
- При необходимости протестируйте локально: `docker run -d -p 3001:3001 --name civilx-universe-test ghcr.io/f1bonacci66/civilx-universe:<tag>` → `curl http://localhost:3001/api/health`.

### 4. Обновление контейнера на сервере
Команды полностью повторяют логику `update-server.ps1` (см. файл для автоматизации plink). Для ручного выполнения:
```
PS C:\Projects\CivilX\Site\civilx-website\universe\universe> ssh -i C:\Users\dimag\.ssh\Universe root@95.163.230.61 "cd /opt/civilx-universe && source .env && echo \"$GITHUB_TOKEN\" | docker login ghcr.io -u f1bonacci66 --password-stdin && docker-compose pull && docker-compose up -d --remove-orphans && docker-compose ps && docker-compose logs --tail=20 universe"
```
- Все части команды в одной строке, как предписано в `server_conection.mdc`.

#### 4.1. Быстрое внесение изменений на сервере (без сборки образа локально)

**Когда использовать**: Для быстрых правок кода (изменение текста, удаление/добавление элементов UI, мелкие исправления), когда не нужно собирать образ локально и загружать в GHCR.

**Преимущества**: 
- Не требует Docker Desktop на локальной машине
- Быстрое применение изменений (5-10 минут вместо 30-60 минут)
- Не нужно загружать образ в GHCR

**Недостатки**:
- Изменения остаются только на сервере (не в GHCR)
- При следующем обновлении через GHCR изменения могут быть перезаписаны
- Рекомендуется для тестирования или временных изменений

**Процесс**:

1. **Подключение к серверу через PuTTY (plink)**:
   ```powershell
   $env:Path += ";C:\Program Files\PuTTY"
   $server = "95.163.230.61"
   $user = "root"
   $pass = "7LfOgcrTvZxbMR9Y"
   $hostKey = "ssh-ed25519 255 SHA256:gN8PzkTrFZUTD+sfsvJVTRXjg6up6VMQ8n2rAt6PnZk"
   ```

2. **Поиск файлов на сервере**:
   ```bash
   # Исходники находятся в /opt/civilx-universe/universe-src
   find /opt/civilx-universe/universe-src -name "sidebar.tsx" -type f
   ```

3. **Внесение изменений через sed или другие инструменты**:
   ```bash
   # Пример: удаление блока кода (строки 421-458)
   cd /opt/civilx-universe/universe-src
   sed -i '421,458d' components/universe/sidebar.tsx
   
   # Пример: удаление блока с комментарием
   sed -i '/Навигация внутри DataLab/,/^        )}/d' components/universe/sidebar.tsx
   
   # Проверка изменений
   grep -n "удаленный_текст" components/universe/sidebar.tsx || echo "Изменения применены"
   ```

4. **Пересборка образа на сервере**:
   ```bash
   cd /opt/civilx-universe/universe-src
   docker build --build-arg NEXT_PUBLIC_API_URL=/api/datalab -t civilx-universe:local .
   ```
   - Это может занять 5-15 минут в зависимости от размера проекта
   - Образ будет помечен как `civilx-universe:local`

5. **Обновление docker-compose.yml для использования локального образа**:
   ```bash
   cd /opt/civilx-universe
   sed -i 's|image:.*|image: civilx-universe:local|' docker-compose.yml
   ```

6. **Перезапуск контейнера**:
   ```bash
   docker stop civilx-universe
   docker rm civilx-universe
   cd /opt/civilx-universe
   docker-compose up -d
   ```

7. **Проверка работы**:
   ```bash
   sleep 10
   docker ps --filter name=civilx-universe
   docker logs civilx-universe --tail=20
   curl http://localhost:3001/api/health
   ```

**Пример полного процесса через PowerShell (с использованием plink)**:
```powershell
$env:Path += ";C:\Program Files\PuTTY"
$server = "95.163.230.61"
$user = "root"
$pass = "7LfOgcrTvZxbMR9Y"
$hostKey = "ssh-ed25519 255 SHA256:gN8PzkTrFZUTD+sfsvJVTRXjg6up6VMQ8n2rAt6PnZk"

# 1. Внесение изменений
plink -ssh "$user@$server" -pw $pass -hostkey $hostKey -batch "cd /opt/civilx-universe/universe-src && sed -i '421,458d' components/universe/sidebar.tsx && echo 'Изменения применены'"

# 2. Пересборка образа
plink -ssh "$user@$server" -pw $pass -hostkey $hostKey -batch "cd /opt/civilx-universe/universe-src && docker build --build-arg NEXT_PUBLIC_API_URL=/api/datalab -t civilx-universe:local . 2>&1 | tail -5"

# 3. Обновление docker-compose.yml
plink -ssh "$user@$server" -pw $pass -hostkey $hostKey -batch "cd /opt/civilx-universe && sed -i 's|image:.*|image: civilx-universe:local|' docker-compose.yml"

# 4. Перезапуск контейнера
plink -ssh "$user@$server" -pw $pass -hostkey $hostKey -batch "docker stop civilx-universe && docker rm civilx-universe && cd /opt/civilx-universe && docker-compose up -d && sleep 5 && docker ps --filter name=civilx-universe"
```

**Важные замечания**:
- После применения изменений рекомендуется зафиксировать их в локальном репозитории и собрать образ через GHCR для постоянного хранения
- Локальный образ `civilx-universe:local` существует только на сервере и не синхронизируется с GHCR
- При следующем обновлении через `docker-compose pull` изменения могут быть потеряны, если не обновить образ в GHCR

### 5. Проверки после деплоя
1. `ssh -i ... root@95.163.230.61 "docker-compose logs --tail=100 universe"`
2. `ssh -i ... root@95.163.230.61 "curl -fsS http://127.0.0.1:3001/api/health"`
3. UI: перейти по `https://civilxuniverse.ru/app/datalab/...` и убедиться, что таблица, Pivot, отчёты и загрузка файлов работают (API URL берётся из `NEXT_PUBLIC_API_URL`).

#### 5.1. Диагностика 502 / прокси
1. Если фронт выдаёт `502 Bad Gateway` на `/api/datalab/*`, проверить логи:
   - `docker logs civilx-universe --tail=100` — наличие `[Proxy] Ошибка запроса` с `ECONNREFUSED 127.0.0.1:8000`.
   - `curl -i http://127.0.0.1:3001/api/datalab/health/` — статус 200 означает рабочий прокси.
2. Если от контейнера запрос падает:
   - Убедиться, что backend слушает `0.0.0.0:8000` (`sudo systemctl restart civilx-backend`).
   - Проверить `INTERNAL_API_URL` и `extra_hosts` в `.env`/`docker-compose.yml`, затем `docker-compose down && up -d`.
3. Backend health напрямую: `curl http://127.0.0.1:8000/api/datalab/health`.
4. Запросы `/api/datalab/projects` без куки авторизации вернут `403 Not authenticated` — это ожидаемо и означает, что проксирование работает.

### 6. Откат
- `docker-compose down` → `docker pull ghcr.io/f1bonacci66/civilx-universe:<old-tag>` → `docker-compose up -d`.
- Храните как минимум один предыдущий тег в GHCR для быстрого возврата.

### 7. Дополнительно
- Для автоматизации можно обернуть шаги в PowerShell-скрипт (см. пример в предыдущем сообщении); обязательные действия остаются неизменными: сборка → push → `docker-compose pull/up` на сервере.
- Регулярно проверяйте токен (`check-token.ps1`) и обновляйте `.env` на сервере при его смене.

