#!/usr/bin/env python3
import sys
import time
from datetime import datetime

# Принудительно отключаем буферизацию
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__

print("=== Тест монитора ===", flush=True)
print(f"Время: {datetime.now()}", flush=True)
print("Тест 1", flush=True)
time.sleep(2)
print("Тест 2", flush=True)
time.sleep(2)
print("Тест 3", flush=True)

