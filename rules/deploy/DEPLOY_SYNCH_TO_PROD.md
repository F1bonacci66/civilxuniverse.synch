# Деплой обновлений с git.synch на PROD сервер

> 📖 **Полная документация** по деплою с описанием всех типичных ошибок и их решений

## 📋 Обзор процесса

Этот документ описывает процесс деплоя обновлений с репозитория `git.synch` на production сервер (95.163.230.61).

**Важно:** Этот процесс НЕ трогает `git.prod` - все изменения идут только через `git.synch`.

## 🎯 Быстрая навигация

- [⚠️ ОБЯЗАТЕЛЬНО: Предварительная проверка](#-обязательно-предварительная-проверка)
- [Быстрый старт](#-быстрый-старт)
- [Подробная инструкция](#-подробная-инструкция)
- [Типичные проблемы и решения](#-типичные-проблемы-и-решения)
  - [404 Not Found](#проблема-1-404-not-found-после-деплоя)
  - [Ошибки компиляции](#проблема-2-ошибки-компиляции-при-сборке-docker-образа)
  - [Проблемы с кодировкой](#проблема-3-проблемы-с-кодировкой-файлов)
  - [Пустые файлы](#проблема-4-пустые-или-поврежденные-файлы)
  - [Контейнер не перезапускается](#проблема-5-контейнер-не-перезапускается)
- [Чеклист перед деплоем](#-чеклист-перед-деплоем)
- [Проверка после деплоя](#-проверка-после-деплоя)

---

## ⚠️ ОБЯЗАТЕЛЬНО: Предварительная проверка

**КРИТИЧНО**: Перед каждым деплоем выполните автоматическую проверку:

```bash
# Автоматическая проверка всех критичных моментов
bash rules/deploy/pre-deploy-check.sh
```

Скрипт проверит:
- ✅ Git статус и синхронизацию с git.synch
- ✅ Отсутствие пустых файлов
- ✅ TypeScript компиляцию
- ✅ Локальную сборку Next.js
- ✅ Структуру файлов
- ✅ Кодировку файлов

**НЕ ПРОПУСКАЙТЕ ЭТОТ ШАГ!** Это предотвратит 90% ошибок деплоя.

Подробный чеклист: [PRE_DEPLOY_CHECKLIST.md](./PRE_DEPLOY_CHECKLIST.md)

Типичные ошибки и решения: [TYPICAL_ERRORS_AND_SOLUTIONS.md](./TYPICAL_ERRORS_AND_SOLUTIONS.md)

---

## 🚀 Быстрый старт

### Вариант 1: Автоматический деплой (рекомендуется)

```powershell
# С вашего компьютера
.\deploy-synch-to-prod-simple.ps1
```

### Вариант 2: Ручной деплой на сервере

```bash
# На prod сервере
cd /opt/civilx-universe
bash deploy-synch-to-prod.sh
```

---

## 📝 Подробная инструкция

### Шаг 1: Предварительная проверка (ОБЯЗАТЕЛЬНО!)

**КРИТИЧНО**: Выполните автоматическую проверку:

```bash
bash rules/deploy/pre-deploy-check.sh
```

Скрипт проверит все критические моменты и выдаст отчет. **НЕ ПРОПУСКАЙТЕ!**

### Шаг 2: Подготовка

**Перед деплоем убедитесь:**

1. ✅ **Предварительная проверка пройдена** (`pre-deploy-check.sh`)
2. ✅ Все изменения закоммичены в `git.dev`
3. ✅ Изменения запушены в `git.synch`
4. ✅ Код протестирован на dev сервере
5. ✅ Все файлы присутствуют в репозитории (особенно `universe-src/app`, `universe-src/lib`, `universe-src/components`)
6. ✅ **Нет пустых файлов**
7. ✅ **TypeScript компиляция проходит без ошибок**
8. ✅ **Локальная сборка Next.js успешна**

### Шаг 3: Проверка структуры репозитория

**Критически важно проверить наличие всех файлов:**

```bash
# На вашем компьютере, в git.synch
cd civilxuniverse.synch
git ls-files | grep "universe-src" | head -20

# Должны быть:
# - universe-src/app/page.tsx
# - universe-src/app/layout.tsx
# - universe-src/app/app/datalab/...
# - universe-src/lib/...
# - universe-src/components/...
```

**Если файлы отсутствуют в git:**

```bash
# Добавьте их в git.dev и запушьте в synch
cd civilxuniverse.dev
git add universe-src/
git commit -m "chore: добавлены файлы для prod деплоя"
git push synch main
```

### Шаг 4: Выполнение деплоя

#### Через PowerShell скрипт (Windows)

```powershell
.\deploy-synch-to-prod-simple.ps1
```

Скрипт автоматически:
- Копирует bash скрипт на сервер
- Получает код из git.synch
- Настраивает .env для PROD
- Пересобирает Docker образ
- Перезапускает контейнер

#### Напрямую на сервере

```bash
ssh root@95.163.230.61
cd /opt/civilx-universe
bash deploy-synch-to-prod.sh
```

---

## ⚙️ Что делает скрипт деплоя

1. **Обновление кода:**
   - Добавляет remote `synch` (если отсутствует)
   - Получает изменения из `git.synch` (ветка main)
   - Выполняет `git reset --hard synch/main`

2. **Настройка конфигурации для PROD:**
   - Создает/обновляет `universe-src/.env` с настройками:
     - `NODE_ENV=production`
     - `NEXT_PUBLIC_API_URL=/api/datalab`
     - `INTERNAL_API_URL=http://172.17.0.1:8000/api/datalab`
   - Обновляет `backend/.env` (если есть):
     - `DATABASE_URL` с `host.docker.internal` вместо прямого IP

3. **Пересборка и перезапуск:**
   - Пересобирает Docker образ фронтенда
   - Останавливает старый контейнер
   - Запускает новый контейнер с обновленным образом

### Важно про NEXT_PUBLIC_API_URL (чтобы не было ERR_CERT_DATE_INVALID)

`NEXT_PUBLIC_API_URL` для Next.js попадает в клиентский JS **на этапе сборки**.
Если собрать образ без правильного build-arg, в бандл может "вшиться" старый URL (например, `https://api.civilx.ru/api/datalab`)
и в браузере будет `net::ERR_CERT_DATE_INVALID` + `Failed to fetch`.

Поэтому в `deploy-synch-to-prod.sh` для PROD сборки используется:

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=/api/datalab -t civilx-universe:local -f Dockerfile .
```

---

## 🔧 Типичные проблемы и решения

### Проблема 0: Backend файлы не синхронизируются с dev сервера

**Симптомы:**
- Эндпоинты отсутствуют на prod, хотя есть на dev
- Разные MD5 хеши файлов на dev и prod
- API возвращает 404 для новых эндпоинтов

**Причина:**
- Скрипт деплоя обновляет только фронтенд из git.synch
- Backend на prod запускается напрямую (не через Docker), файлы не синхронизируются автоматически
- Файлы в git.synch могут отличаться от файлов в работающем контейнере на dev

**Решение:**

```bash
# 1. Синхронизация всех backend API файлов с dev на prod
# Используйте скрипт sync-all-backend-files.ps1 (создан для этой цели)

# Или вручную:
# С dev сервера (79.174.77.29):
docker exec backend-backend-1 find /app/app/api/v1 -name '*.py' -type f

# Копируем каждый файл:
docker exec backend-backend-1 cat /app/app/api/v1/projects.py > /tmp/projects.py
pscp -pw "0EqGHGTrCrH6qmYu" root@79.174.77.29:/tmp/projects.py projects.py
pscp -pw "7LfOgcrTvZxbMR9Y" projects.py root@95.163.230.61:/opt/civilx-backend/app/api/v1/

# 2. Перезапуск бэкенда на prod
ssh root@95.163.230.61
cd /opt/civilx-backend
pkill -9 -f 'uvicorn app.main'
sleep 5
su - ubuntu -c 'cd /opt/civilx-backend && nohup /usr/local/bin/python3.10 /usr/local/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 > backend.log 2>&1 &'
sleep 30
curl http://localhost:8000/health
```

**Профилактика:**
- ✅ **КРИТИЧНО**: После каждого деплоя проверяйте синхронизацию backend файлов
- Используйте скрипт `sync-all-backend-files.ps1` для автоматической синхронизации
- Проверяйте MD5 хеши файлов: `md5sum app/api/v1/*.py` на обоих серверах
- Убедитесь, что все изменения backend закоммичены в git.synch

---

### Проблема 1: 404 Not Found после деплоя

**Симптомы:**
- Сайт возвращает 404
- Контейнер работает, но страницы не найдены

**Причины:**
- Отсутствуют файлы `app/page.tsx` или `app/layout.tsx`
- Файлы не попали в git репозиторий
- Структура директорий неправильная

**Решение:**

```bash
# 1. Проверить наличие файлов на сервере
ssh root@95.163.230.61
cd /opt/civilx-universe/universe-src
ls -la app/*.tsx

# 2. Если файлы отсутствуют, скопировать из локального репозитория
# С вашего компьютера:
pscp -pw "7LfOgcrTvZxbMR9Y" -hostkey "ssh-ed25519 255 SHA256:gN8PzkTrFZUTD+sfsvJVTRXjg6up6VMQ8n2rAt6PnZk" -batch -r "universe/app" "root@95.163.230.61:/opt/civilx-universe/universe-src/"

# 3. Пересобрать образ
cd /opt/civilx-universe/universe-src
docker build --build-arg NEXT_PUBLIC_API_URL=/api/datalab -t civilx-universe:local .

# 4. Перезапустить контейнер
docker stop civilx-universe
docker rm civilx-universe
docker run -d --name civilx-universe --restart unless-stopped -p 3001:3001 --env-file .env civilx-universe:local
```

**Профилактика:**
- Всегда проверяйте наличие файлов в git перед деплоем
- Используйте `git status` и `git ls-files` для проверки

---

### Проблема 2: Ошибки компиляции при сборке Docker образа

**Симптомы:**
- `docker build` завершается с ошибкой
- Ошибки типа "Module not found", "Type error", "Cannot find name"

**Типичные ошибки:**

#### Ошибка: `Cannot find name 'Loader2'`

**Причина:** Отсутствует импорт из `lucide-react`

**Решение:**

```bash
# Найти все использования Loader2
grep -r "Loader2" universe-src/app/

# Добавить импорт в файлы, где используется:
# import { ..., Loader2 } from 'lucide-react'
```

#### Ошибка: `'clearAllProjectsCache' is not exported`

**Причина:** Функция не экспортирована из модуля

**Решение:**

```typescript
// В universe/lib/cache/projects-cache.ts добавить:
export function clearAllProjectsCache(): void {
  // Заглушка
}
```

#### Ошибка: `Property 'forEach' does not exist on type '{ positions: ... }'`

**Причина:** API возвращает объект, а не массив

**Решение:**

```typescript
// Было:
positions.forEach((pos) => { ... })

// Должно быть:
response.positions.forEach((pos) => { ... })
// или
positions.positions.forEach((pos) => { ... })
```

**Профилактика:**
- Запускайте `npm run build` локально перед коммитом
- Проверяйте типы TypeScript: `npm run type-check` (если есть)
- Используйте линтер: `npm run lint`

---

### Проблема 3: Проблемы с кодировкой файлов

**Симптомы:**
- `Failed to read source code: stream did not contain valid UTF-8`
- Файлы в UTF-16 вместо UTF-8

**Решение:**

```bash
# Проверить кодировку файла на сервере
file components/universe/sidebar.tsx

# Если UTF-16, перекопировать файл с правильной кодировкой
# С вашего компьютера (PowerShell):
Get-ChildItem "universe\components" -Recurse -File | ForEach-Object {
    $content = Get-Content $_.FullName -Raw -Encoding UTF8
    [System.IO.File]::WriteAllText($_.FullName, $content, [System.Text.Encoding]::UTF8)
}

# Затем скопировать на сервер
pscp -pw "7LfOgcrTvZxbMR9Y" -hostkey "ssh-ed25519 255 SHA256:gN8PzkTrFZUTD+sfsvJVTRXjg6up6VMQ8n2rAt6PnZk" -batch -r "universe/components" "root@95.163.230.61:/opt/civilx-universe/universe-src/"
```

**Профилактика:**
- Настройте git для сохранения файлов в UTF-8:
  ```bash
  git config core.autocrlf false
  git config core.quotepath false
  ```

---

### Проблема 4: Пустые или поврежденные файлы

**Симптомы:**
- `File is not a module`
- Файл существует, но имеет размер 1 байт

**Решение:**

```bash
# Проверить размер файла
ls -lh app/app/ai-classifier/project/[projectId]/version/[versionId]/page.tsx

# Если файл пустой или поврежден, удалить директорию или перекопировать
rm -rf app/app/ai-classifier  # если не нужна
# или
# Скопировать правильную версию из локального репозитория
```

**Профилактика:**
- Не коммитьте пустые файлы
- Проверяйте файлы перед коммитом: `git diff`

---

### Проблема 5: Контейнер не перезапускается

**Симптомы:**
- Старый код все еще работает
- Изменения не применяются

**Решение:**

```bash
# Принудительная пересборка и перезапуск
cd /opt/civilx-universe/universe-src
docker build --no-cache --build-arg NEXT_PUBLIC_API_URL=/api/datalab -t civilx-universe:local .
docker stop civilx-universe
docker rm civilx-universe
docker run -d --name civilx-universe --restart unless-stopped -p 3001:3001 --env-file .env civilx-universe:local

# Проверить статус
docker ps --filter name=civilx-universe
docker logs civilx-universe --tail 20
```

---

### Проблема 6: Backend не перезапускается или использует старый код

**Симптомы:**
- Backend процесс работает, но изменения не применяются
- Эндпоинты возвращают старые данные
- Ошибка: `nohup: failed to run command '/usr/local/bin/python3.10': No such file or directory`

**Причина:**
- Процесс не был полностью остановлен перед запуском нового
- Неправильный путь к Python интерпретатору
- Python кэширует .pyc файлы

**Решение:**

```bash
# 1. Найти и убить все процессы uvicorn
ps aux | grep 'uvicorn app.main' | grep -v grep
pkill -9 -f 'uvicorn app.main'
# Или по конкретному PID:
kill -9 <PID>

# 2. Очистить Python кэш
cd /opt/civilx-backend
find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
find . -name "*.pyc" -delete 2>/dev/null || true

# 3. Проверить путь к Python
which python3.10
# Если /usr/local/bin/python3.10 не существует, используйте:
# /usr/bin/python3.10 или python3.10

# 4. Перезапустить с правильным путем
cd /opt/civilx-backend
su - ubuntu -c 'cd /opt/civilx-backend && nohup python3.10 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 > backend.log 2>&1 &'

# 5. Проверить запуск
sleep 30
curl http://localhost:8000/health
tail -20 backend.log
```

**Профилактика:**
- Всегда используйте `pkill -9` для полной остановки процессов
- Проверяйте путь к Python: `which python3.10`
- Очищайте кэш перед перезапуском при критических изменениях
- Проверяйте логи после перезапуска: `tail -20 backend.log`

---

### Проблема 7: FastAPI маршруты конфликтуют (конкретный путь интерпретируется как параметр)

**Симптомы:**
- Эндпоинт `/projects/versions-count` возвращает `{"detail":"Проект не найден"}`
- FastAPI интерпретирует `versions-count` как `project_id` в маршруте `/{project_id}`

**Причина:**
- В FastAPI порядок регистрации маршрутов критичен
- Конкретные пути (без параметров) должны быть объявлены ПЕРЕД параметризованными
- Если `@router.get("/{project_id}")` идет раньше `@router.get("/versions-count")`, FastAPI попытается сопоставить `versions-count` как `project_id`

**Решение:**

```python
# ❌ НЕПРАВИЛЬНО - параметризованный маршрут идет первым
router = APIRouter(prefix="/projects", tags=["projects"])

@router.get("/{project_id}", response_model=ProjectResponse)  # ❌ Это перехватит /versions-count
async def get_project(project_id: str, ...):
    ...

@router.get("/versions-count", response_model=dict)  # ❌ Никогда не достигнется
async def get_projects_versions_count(...):
    ...

# ✅ ПРАВИЛЬНО - конкретные пути идут первыми
router = APIRouter(prefix="/projects", tags=["projects"])

@router.get("/versions-count", response_model=dict)  # ✅ Конкретный путь первым
async def get_projects_versions_count(...):
    ...

@router.get("", response_model=List[ProjectResponse])  # ✅ Пустой путь
async def list_projects(...):
    ...

@router.get("/{project_id}", response_model=ProjectResponse)  # ✅ Параметризованный последним
async def get_project(project_id: str, ...):
    ...
```

**Правильный порядок маршрутов:**
1. Конкретные пути (например, `/versions-count`, `/search`)
2. Пустой путь (`""` для списка)
3. Параметризованные пути (например, `/{project_id}`, `/{id}`)

**Профилактика:**
- ✅ Всегда размещайте конкретные маршруты ПЕРЕД параметризованными
- Проверяйте порядок маршрутов после добавления новых эндпоинтов
- Используйте `grep -n '@router.get'` для проверки порядка
- Тестируйте эндпоинты после изменений: `curl http://localhost:8000/api/datalab/projects/versions-count`

---

### Проблема 8: Эндпоинты отсутствуют после деплоя

**Симптомы:**
- Фронтенд получает 404 для определенных эндпоинтов
- Эндпоинт работает на dev, но не работает на prod
- Логи показывают: `{"detail":"Not Found"}` или `{"detail":"Проект не найден"}`

**Причина:**
- Файлы не были синхронизированы с dev сервера
- Эндпоинт не был добавлен в файл на prod
- Backend не был перезапущен после изменений

**Решение:**

```bash
# 1. Проверить наличие эндпоинта в файле на prod
ssh root@95.163.230.61
grep -n "versions-count\|get_projects_versions_count" /opt/civilx-backend/app/api/v1/projects.py

# 2. Если отсутствует, скопировать с dev
# (см. Проблема 0: Backend файлы не синхронизируются)

# 3. Проверить порядок маршрутов
grep -n '@router.get' /opt/civilx-backend/app/api/v1/projects.py | head -10

# 4. Перезапустить backend (см. Проблема 6)

# 5. Проверить эндпоинт
curl http://localhost:8000/api/datalab/projects/versions-count
```

**Профилактика:**
- ✅ Синхронизируйте backend файлы после каждого деплоя
- Проверяйте наличие всех эндпоинтов: `grep -r "@router.get\|@router.post" app/api/v1/`
- Тестируйте критичные эндпоинты после деплоя
- Ведите список всех эндпоинтов для проверки

---

## ✅ Чеклист перед деплоем

> ⚠️ **ВАЖНО**: Используйте автоматический скрипт проверки:
> ```bash
> bash rules/deploy/pre-deploy-check.sh
> ```
> 
> Подробный чеклист: [PRE_DEPLOY_CHECKLIST.md](./PRE_DEPLOY_CHECKLIST.md)

### Frontend
- [ ] **ОБЯЗАТЕЛЬНО**: Выполнена автоматическая проверка (`pre-deploy-check.sh`)
- [ ] Все изменения закоммичены в `git.dev`
- [ ] Изменения запушены в `git.synch`
- [ ] Проверена структура файлов: `git ls-files | grep universe-src`
- [ ] Локальная сборка проходит успешно: `npm run build`
- [ ] Нет ошибок TypeScript: проверены типы (`npx tsc --noEmit`)
- [ ] Все импорты корректны
- [ ] Файлы в правильной кодировке (UTF-8)
- [ ] **Нет пустых файлов** (критично!)
- [ ] Все API вызовы используют правильный формат
- [ ] `.env` файлы настроены для PROD

### Backend
- [ ] **КРИТИЧНО**: Все изменения backend закоммичены в `git.synch`
- [ ] Проверен порядок маршрутов в FastAPI (конкретные пути перед параметризованными)
- [ ] Все новые эндпоинты протестированы на dev сервере
- [ ] Проверены MD5 хеши файлов на dev и в git.synch
- [ ] Подготовлен план синхронизации backend файлов после деплоя

---

## 🔍 Проверка после деплоя

### 1. Проверка статуса контейнера фронтенда

```bash
ssh root@95.163.230.61
docker ps --filter name=civilx-universe
docker logs civilx-universe --tail 30
```

**Ожидаемый результат:**
- Контейнер в статусе `Up` (не `unhealthy`)
- В логах: `✓ Ready in ...ms`
- Нет ошибок в логах

### 2. Проверка доступности фронтенда

```bash
# На сервере
curl -I http://localhost:3001

# Ожидаемый результат:
# HTTP/1.1 200 OK (не 404!)
```

### 3. Проверка backend процесса

```bash
# Проверить, что процесс запущен
ps aux | grep 'uvicorn app.main' | grep -v grep

# Проверить health endpoint
curl http://localhost:8000/health
# Ожидаемый результат: {"status":"healthy","message":"Backend is running"}

# Проверить логи на ошибки
tail -30 /opt/civilx-backend/backend.log | grep -i error || echo "Нет ошибок"
```

### 4. **КРИТИЧНО**: Синхронизация backend файлов

```bash
# Сравнить MD5 хеши файлов на dev и prod
# На dev (79.174.77.29):
docker exec backend-backend-1 md5sum /app/app/api/v1/projects.py

# На prod (95.163.230.61):
md5sum /opt/civilx-backend/app/api/v1/projects.py

# Если хеши не совпадают, синхронизировать (см. Проблема 0)
```

### 5. Проверка критичных эндпоинтов

```bash
# Проверить основные эндпоинты
curl http://localhost:8000/api/datalab/projects/versions-count
# Ожидаемый результат: JSON объект или {"detail":"Unauthorized"} (не 404!)

curl http://localhost:8000/api/datalab/projects/
# Ожидаемый результат: JSON массив или {"detail":"Unauthorized"} (не 404!)

# Проверить порядок маршрутов
grep -n '@router.get' /opt/civilx-backend/app/api/v1/projects.py | head -10
# Убедиться, что конкретные пути идут перед параметризованными
```

### 6. Проверка через браузер

- Откройте https://civilxuniverse.ru
- Проверьте, что главная страница загружается
- Проверьте основные маршруты (например, `/app/datalab`)
- Откройте DevTools (F12) → Network, проверьте отсутствие 404 ошибок
- Проверьте консоль браузера на ошибки JavaScript

---

## 📁 Структура файлов на prod сервере

```
/opt/civilx-universe/
├── .git/                    # Git репозиторий
├── universe-src/            # Исходный код фронтенда
│   ├── app/                 # Next.js App Router
│   │   ├── page.tsx         # ⚠️ КРИТИЧНО: должен существовать!
│   │   ├── layout.tsx       # ⚠️ КРИТИЧНО: должен существовать!
│   │   └── app/             # Маршруты приложений
│   ├── components/          # React компоненты
│   ├── lib/                 # Утилиты и API клиенты
│   ├── .env                 # ⚠️ Настройки для PROD
│   ├── Dockerfile           # Dockerfile для сборки
│   └── package.json
└── deploy-synch-to-prod.sh  # Скрипт деплоя
```

---

## 🔐 Учетные данные

**Prod сервер:**
- IP: `95.163.230.61`
- Пользователь: `root`
- Пароль: `7LfOgcrTvZxbMR9Y`
- Host key: `ssh-ed25519 255 SHA256:gN8PzkTrFZUTD+sfsvJVTRXjg6up6VMQ8n2rAt6PnZk`

**Git репозитории:**
- `git.dev`: https://github.com/F1bonacci66/civilxuniverse.dev.git
- `git.synch`: https://github.com/F1bonacci66/civilxuniverse.synch.git
- `git.prod`: https://github.com/F1bonacci66/civilx.univers.git (НЕ ТРОГАТЬ!)

---

## 🚨 Критические моменты

### Frontend
1. **НЕ коммитьте изменения напрямую в `git.prod`** - используйте только `git.synch`
2. **Всегда проверяйте наличие файлов** перед деплоем
3. **Проверяйте локальную сборку** перед коммитом
4. **Используйте правильную кодировку** (UTF-8) для всех файлов
5. **Не коммитьте пустые файлы** - они вызовут ошибки сборки
6. **Проверяйте импорты** - все используемые модули должны быть импортированы
7. **Проверяйте типы** - TypeScript ошибки нужно исправлять до деплоя

### Backend
8. **КРИТИЧНО: Синхронизируйте backend файлы после каждого деплоя** - скрипт деплоя обновляет только фронтенд
9. **Проверяйте порядок маршрутов FastAPI** - конкретные пути должны идти перед параметризованными
10. **Всегда перезапускайте backend после изменений** - используйте `pkill -9` для полной остановки
11. **Проверяйте MD5 хеши файлов** - убедитесь, что файлы на prod совпадают с dev
12. **Тестируйте эндпоинты после деплоя** - проверяйте критичные API endpoints
13. **Проверяйте путь к Python** - используйте `which python3.10` для определения правильного пути

---

## 📞 Поддержка

Если возникли проблемы, которые не описаны в этом документе:

1. Проверьте логи контейнера: `docker logs civilx-universe`
2. Проверьте логи сборки: сохраните вывод `docker build`
3. Проверьте структуру файлов на сервере
4. Сравните с рабочей версией на dev сервере

---

## 📝 История изменений

- **2026-02-10**: Создана документация на основе опыта деплоя
  - Добавлены разделы по типичным ошибкам и их решениям
  - Добавлен чеклист перед деплоем
  - Добавлены инструкции по проверке после деплоя

- **2026-02-11**: Обновлена документация на основе проблем синхронизации
  - **Добавлена Проблема 0**: Backend файлы не синхронизируются с dev сервера
  - **Добавлена Проблема 6**: Backend не перезапускается или использует старый код
  - **Добавлена Проблема 7**: FastAPI маршруты конфликтуют (порядок маршрутов)
  - **Добавлена Проблема 8**: Эндпоинты отсутствуют после деплоя
  - Обновлен чеклист перед деплоем (добавлен раздел Backend)
  - Расширена проверка после деплоя (добавлены проверки backend)

