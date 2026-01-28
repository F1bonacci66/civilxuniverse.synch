#!/usr/bin/env python3
# monitor-rvt-converter.py
# Запускать на Linux prod сервере (95.163.230.61) в фоновом режиме
# Проверяет доступность сервиса на Windows сервере каждые 5 секунд
# Автоматически запускает сервис через SSH, если он недоступен

import os
import sys
import time
import subprocess
import requests
import json
import base64
from datetime import datetime

# Отключаем буферизацию вывода
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__

# Конфигурация
WINDOWS_SERVER = "176.98.178.75"
WINDOWS_USER = "Administrator"
WINDOWS_PASS = "cngFLzG-Q*E@3d"
WINDOWS_HOST_KEY = "ssh-ed25519 255 SHA256:HNaeAbcp+y0R8PWGwWU9yvKko1Kg3kjZvaIllkGx+tE"
HEALTH_ENDPOINT = f"http://{WINDOWS_SERVER}:8001/health"
CHECK_INTERVAL = 5  # секунд
STARTUP_WAIT_TIME = 30  # секунд ожидания после запуска сервиса
MAX_STARTUP_CHECKS = 6  # количество проверок после запуска (30 сек / 5 сек = 6 проверок)

# Пути на Windows сервере
CONVERTER_DIR = "C:\\civilx-universe\\converter-service"
PYTHON_EXE = f"{CONVERTER_DIR}\\venv\\Scripts\\python.exe"
PORT = 8001
BAT_FILE_PATH = "C:\\temp\\start-rvt-converter-8001.bat"
LOG_FILE_PATH = "C:\\temp\\rvt-converter-8001.log"
TASK_NAME = "RVTConverterService8001"

def log_print(message):
    """Вывод с автоматическим flush"""
    print(message, flush=True)

def check_service_health():
    """Проверяет доступность сервиса через health endpoint"""
    try:
        response = requests.get(HEALTH_ENDPOINT, timeout=3)
        if response.status_code == 200:
            data = response.json()
            # Принимаем "healthy" и "degraded" как рабочие статусы
            status = data.get("status", "")
            return status in ["healthy", "degraded"]
        return False
    except (requests.exceptions.RequestException, json.JSONDecodeError) as e:
        return False

def wait_for_service_startup(max_checks=MAX_STARTUP_CHECKS):
    """Ждет запуска сервиса, проверяя его доступность"""
    log_print(f"Ожидание запуска сервиса (до {max_checks * CHECK_INTERVAL} секунд)...")
    
    for i in range(max_checks):
        time.sleep(CHECK_INTERVAL)
        if check_service_health():
            log_print(f"✅ Сервис успешно запущен и доступен (проверка {i+1}/{max_checks})")
            return True
        else:
            log_print(f"⏳ Ожидание запуска сервиса... (проверка {i+1}/{max_checks})")
    
    log_print(f"⚠️ Сервис не ответил в течение {max_checks * CHECK_INTERVAL} секунд после запуска")
    return False

def start_service_via_ssh():
    """Подключается к Windows серверу через SSH и запускает сервис"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_print(f"[{timestamp}] ⚠️ Сервис недоступен, запускаем через SSH...")
    
    # Создаем bat файл для запуска сервиса с логированием
    # Если есть RDP-сессия - откроется окно, если нет - будет работать в фоне с логами
    bat_content = f"""@echo off
cd /d {CONVERTER_DIR}
title RVT Converter Service (Port {PORT})
echo Starting RVT Converter Service...
echo Port: {PORT}
echo Directory: {CONVERTER_DIR}
echo Started: %date% %time%
echo Log file: {LOG_FILE_PATH}
echo.
{PYTHON_EXE} -m uvicorn main:app --host 0.0.0.0 --port {PORT} >> {LOG_FILE_PATH} 2>&1
pause
"""
    
    # PowerShell скрипт для запуска сервиса
    # Пытаемся запустить в интерактивной сессии (если есть RDP), иначе в фоне
    ps_script = f'''
$ErrorActionPreference = "Continue"

# Создаем bat файл
$batContent = @"
{bat_content.replace('$', '`$')}
"@

$batPath = "{BAT_FILE_PATH}"
$batDir = Split-Path -Parent $batPath
$logDir = Split-Path -Parent "{LOG_FILE_PATH}"

# Создаем директории, если не существуют
if (-not (Test-Path $batDir)) {{
    New-Item -ItemType Directory -Path $batDir -Force | Out-Null
}}
if (-not (Test-Path $logDir)) {{
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}}

# Создаем bat файл
Set-Content -Path $batPath -Value $batContent -Encoding ASCII
Write-Host "Bat file created: $batPath"

# Проверяем, есть ли активные процессы Python с converter-service
$existingProcesses = Get-Process python -ErrorAction SilentlyContinue | Where-Object {{
    $_.Path -like "*converter-service*"
}}

if ($existingProcesses) {{
    Write-Host "Stopping existing processes..."
    $existingProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}}

# Удаляем старую задачу, если существует
$taskExists = Get-ScheduledTask -TaskName "{TASK_NAME}" -ErrorAction SilentlyContinue
if ($taskExists) {{
    Unregister-ScheduledTask -TaskName "{TASK_NAME}" -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Old task removed"
}}

# Метод 1: Пытаемся запустить через планировщик задач в интерактивной сессии
# Это откроет окно CMD, если есть активная RDP-сессия
try {{
    $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/k `"$batPath`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive -RunLevel Highest
    
    Register-ScheduledTask -TaskName "{TASK_NAME}" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "RVT Converter Service (Port {PORT})" | Out-Null
    Write-Host "Task created: {TASK_NAME}"
    
    Start-ScheduledTask -TaskName "{TASK_NAME}"
    Write-Host "Task started (will open CMD window if RDP session is active)"
    
    Start-Sleep -Seconds 3
    
    # Удаляем триггер (задача уже запущена)
    $task = Get-ScheduledTask -TaskName "{TASK_NAME}"
    $task.Triggers.Clear()
    Set-ScheduledTask -TaskName "{TASK_NAME}" -Task $task | Out-Null
}} catch {{
    Write-Host "Failed to start via scheduled task: $($_.Exception.Message)"
    
    # Метод 2: Запускаем напрямую в фоне с логированием
    Write-Host "Trying to start process directly in background..."
    $process = Start-Process -FilePath "{PYTHON_EXE}" -ArgumentList "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "{PORT}" -WorkingDirectory "{CONVERTER_DIR}" -WindowStyle Hidden -RedirectStandardOutput "{LOG_FILE_PATH}" -RedirectStandardError "{LOG_FILE_PATH}" -PassThru
    Write-Host "Process started in background (PID: $($process.Id))"
    Write-Host "Logs will be written to: {LOG_FILE_PATH}"
}}
'''
    
    # Кодируем PowerShell скрипт в base64 для безопасной передачи
    ps_script_bytes = ps_script.encode('utf-16-le')
    ps_script_encoded = base64.b64encode(ps_script_bytes).decode('ascii')
    
    ps_cmd = f"powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand {ps_script_encoded}"
    
    try:
        # Проверяем наличие sshpass (для автоматического ввода пароля)
        use_sshpass = subprocess.run(["which", "sshpass"], capture_output=True).returncode == 0
        
        if use_sshpass:
            # Используем sshpass для автоматического ввода пароля
            result = subprocess.run(
                [
                    "sshpass", "-p", WINDOWS_PASS,
                    "ssh",
                    "-o", "StrictHostKeyChecking=no",
                    "-o", "UserKnownHostsFile=/dev/null",
                    f"{WINDOWS_USER}@{WINDOWS_SERVER}",
                    ps_cmd
                ],
                capture_output=True,
                text=True,
                timeout=30
            )
        else:
            # Используем обычный ssh (требует настройки SSH ключей)
            result = subprocess.run(
                [
                    "ssh",
                    "-o", "StrictHostKeyChecking=no",
                    "-o", "UserKnownHostsFile=/dev/null",
                    f"{WINDOWS_USER}@{WINDOWS_SERVER}",
                    ps_cmd
                ],
                capture_output=True,
                text=True,
                timeout=30
            )
        
        if result.returncode == 0:
            log_print(f"[{timestamp}] ✅ Команда запуска выполнена успешно")
            if result.stdout:
                log_print(f"[{timestamp}] Вывод: {result.stdout.strip()}")
            
            # Ждем запуска сервиса с проверками
            if wait_for_service_startup():
                log_print(f"[{timestamp}] ✅ Сервис запущен и работает")
                log_print(f"[{timestamp}] ℹ️ Если есть активная RDP-сессия - окно CMD должно открыться")
                log_print(f"[{timestamp}] ℹ️ Если RDP-сессии нет - процесс работает в фоне, логи в: {LOG_FILE_PATH}")
            else:
                log_print(f"[{timestamp}] ⚠️ Сервис запущен, но не отвечает на health endpoint")
                log_print(f"[{timestamp}] ⚠️ Проверьте процесс: Get-Process python | Where-Object {{ `$_.Path -like '*converter-service*' }}")
                log_print(f"[{timestamp}] ⚠️ Проверьте логи: Get-Content {LOG_FILE_PATH} -Tail 50")
        else:
            log_print(f"[{timestamp}] ⚠️ Команда выполнена с кодом {result.returncode}")
            if result.stderr:
                log_print(f"[{timestamp}] Ошибка: {result.stderr.strip()}")
            if result.stdout:
                log_print(f"[{timestamp}] Вывод: {result.stdout.strip()}")
        
    except subprocess.TimeoutExpired:
        log_print(f"[{timestamp}] ❌ Таймаут при выполнении команды через SSH")
    except FileNotFoundError:
        log_print(f"[{timestamp}] ❌ SSH или sshpass не найден. Установите: apt-get install openssh-client sshpass")
    except Exception as e:
        log_print(f"[{timestamp}] ❌ Ошибка при запуске сервиса: {e}")

def main():
    """Основной цикл мониторинга"""
    log_print("=== Монитор процесса RVT-CSV конвертации ===")
    log_print(f"Проверка доступности сервиса на {WINDOWS_SERVER}:8001")
    log_print(f"Интервал проверки: {CHECK_INTERVAL} секунд")
    log_print("Для остановки нажмите Ctrl+C")
    log_print("")
    log_print("ℹ️ Если RDP-сессия активна - откроется окно CMD")
    log_print(f"ℹ️ Если RDP-сессии нет - процесс работает в фоне, логи в: {LOG_FILE_PATH}")
    log_print("")
    
    consecutive_failures = 0
    max_consecutive_failures = 2  # Запускать только после 2 последовательных неудач
    
    while True:
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # Проверяем доступность сервиса
            if check_service_health():
                log_print(f"[{timestamp}] ✅ Сервис доступен")
                consecutive_failures = 0  # Сбрасываем счетчик неудач
            else:
                consecutive_failures += 1
                log_print(f"[{timestamp}] ❌ Сервис недоступен (неудача {consecutive_failures}/{max_consecutive_failures})")
                
                # Запускаем только после нескольких последовательных неудач
                if consecutive_failures >= max_consecutive_failures:
                    log_print(f"[{timestamp}] ⚠️ Сервис недоступен {consecutive_failures} раз подряд, запускаем...")
                    start_service_via_ssh()
                    consecutive_failures = 0  # Сбрасываем после попытки запуска
            
        except KeyboardInterrupt:
            log_print("\n\nМонитор остановлен пользователем")
            break
        except Exception as e:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            log_print(f"[{timestamp}] ❌ Ошибка в мониторе: {e}")
        
        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    main()

