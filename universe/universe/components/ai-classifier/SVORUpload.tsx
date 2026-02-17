'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, FileText, CheckCircle2, XCircle, Loader2, Download, AlertCircle } from 'lucide-react'
import { uploadSVORPositions, type SVORPositionCreate } from '@/lib/api/ai-classification'

interface SVORUploadProps {
  onUploadComplete?: () => void
}

interface ParseResult {
  success: boolean
  positions: SVORPositionCreate[]
  errors: string[]
}

export function SVORUpload({ onUploadComplete }: SVORUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; count: number } | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Парсинг CSV файла
  const parseCSV = (text: string, defaultGroupName?: string): ParseResult => {
    console.log('[SVOR Parse] 🔍 Начало парсинга CSV')
    console.log('[SVOR Parse] Название СВОР по умолчанию:', defaultGroupName || 'не указано')
    const errors: string[] = []
    const positions: SVORPositionCreate[] = []
    
    // Разбиваем на строки
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    console.log('[SVOR Parse] Всего строк в файле:', lines.length)
    
    if (lines.length === 0) {
      console.error('[SVOR Parse] ❌ Файл пуст')
      return { success: false, positions: [], errors: ['Файл пуст'] }
    }
    
    // Парсим заголовки
    const headerLine = lines[0]
    const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    console.log('[SVOR Parse] Заголовки найдены:', headers)
    
    // Проверяем обязательные колонки
    const codeIndex = headers.findIndex(h => h.toLowerCase() === 'svor_code')
    const nameIndex = headers.findIndex(h => h.toLowerCase() === 'svor_name')
    
    console.log('[SVOR Parse] Индексы колонок:', {
      svor_code: codeIndex,
      svor_name: nameIndex,
    })
    
    if (codeIndex === -1) {
      console.error('[SVOR Parse] ❌ Не найдена колонка svor_code')
      return { success: false, positions: [], errors: ['Не найдена колонка svor_code'] }
    }
    if (nameIndex === -1) {
      console.error('[SVOR Parse] ❌ Не найдена колонка svor_name')
      return { success: false, positions: [], errors: ['Не найдена колонка svor_name'] }
    }
    
    // Индексы опциональных колонок
    const descIndex = headers.findIndex(h => h.toLowerCase() === 'svor_description')
    
    console.log('[SVOR Parse] Опциональные колонки:', {
      svor_description: descIndex,
    })
    console.log('[SVOR Parse] Начинаем парсинг', lines.length - 1, 'строк данных...')
    
    // Парсим данные
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      // Простой парсинг CSV (учитываем кавычки)
      const values: string[] = []
      let current = ''
      let inQuotes = false
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j]
        
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      values.push(current.trim()) // Последнее значение
      
      // Извлекаем значения
      const code = values[codeIndex]?.replace(/^"|"$/g, '').trim()
      const name = values[nameIndex]?.replace(/^"|"$/g, '').trim()
      
      // Валидация обязательных полей
      if (!code) {
        errors.push(`Строка ${i + 1}: отсутствует svor_code`)
        continue
      }
      if (!name) {
        errors.push(`Строка ${i + 1}: отсутствует svor_name`)
        continue
      }
      
      // Создаем позицию
      const position: SVORPositionCreate = {
        svorCode: code,
        svorName: name,
      }
      
      // Опциональные поля
      if (descIndex !== -1 && values[descIndex]) {
        position.svorDescription = values[descIndex].replace(/^"|"$/g, '').trim()
      }
      
      // Логируем каждую позицию для диагностики
      console.log(`[SVOR Parse] Позиция ${i}: код="${code}", название="${name}"`)
      
      positions.push(position)
    }
    
    // Проверяем на дубликаты кодов после парсинга
    const codes = positions.map(p => p.svorCode)
    const uniqueCodes = new Set(codes)
    if (codes.length !== uniqueCodes.size) {
      const duplicateCodes = Array.from(uniqueCodes).filter(code => codes.filter(c => c === code).length > 1)
      console.warn('[SVOR Parse] ⚠️ Обнаружены дубликаты кодов после парсинга:', duplicateCodes)
      duplicateCodes.forEach(dupCode => {
        const count = codes.filter(c => c === dupCode).length
        console.warn(`[SVOR Parse]   Код "${dupCode}" встречается ${count} раз(а)`)
      })
    }
    
    console.log('[SVOR Parse] ✅ Парсинг завершен')
    console.log('[SVOR Parse] Успешно распарсено позиций:', positions.length)
    console.log('[SVOR Parse] Уникальных кодов:', uniqueCodes.size)
    console.log('[SVOR Parse] Найдено ошибок:', errors.length)
    
    return {
      success: errors.length === 0,
      positions,
      errors,
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      console.log('[SVOR Upload] Файл не выбран')
      return
    }
    
    console.log('[SVOR Upload] ========================================')
    console.log('[SVOR Upload] Начало загрузки CSV файла СВОР')
    console.log('[SVOR Upload] Имя файла:', file.name)
    console.log('[SVOR Upload] Размер файла:', file.size, 'байт', `(${(file.size / 1024).toFixed(2)} KB)`)
    console.log('[SVOR Upload] Тип файла:', file.type)
    
    // Проверяем расширение
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.csv')) {
      console.error('[SVOR Upload] ❌ Ошибка: Неподдерживаемый формат файла. Ожидается .csv')
      setUploadResult({
        success: false,
        message: 'Поддерживаются только CSV файлы',
        count: 0,
      })
      return
    }
    
    setIsUploading(true)
    setUploadResult(null)
    setParseErrors([])
    
    const startTime = Date.now()
    
    try {
      // Читаем файл
      console.log('[SVOR Upload] 📖 Чтение файла...')
      const readStartTime = Date.now()
      const text = await file.text()
      const readDuration = Date.now() - readStartTime
      console.log('[SVOR Upload] ✅ Файл прочитан за', readDuration, 'мс')
      console.log('[SVOR Upload] Размер содержимого:', text.length, 'символов')
      console.log('[SVOR Upload] Первые 200 символов:', text.substring(0, 200))
      
      // Извлекаем название СВОР из имени файла (без расширения)
      const svorNameFromFile = file.name.replace(/\.csv$/i, '').trim()
      console.log('[SVOR Upload] Название СВОР из имени файла:', svorNameFromFile)
      
      // Парсим CSV
      console.log('[SVOR Upload] 🔍 Парсинг CSV...')
      const parseStartTime = Date.now()
      const parseResult = parseCSV(text, svorNameFromFile)
      const parseDuration = Date.now() - parseStartTime
      console.log('[SVOR Upload] ✅ Парсинг завершен за', parseDuration, 'мс')
      console.log('[SVOR Upload] Найдено позиций:', parseResult.positions.length)
      console.log('[SVOR Upload] Найдено ошибок:', parseResult.errors.length)
      
      if (parseResult.errors.length > 0) {
        console.warn('[SVOR Upload] ⚠️ Ошибки при парсинге:')
        parseResult.errors.forEach((error, index) => {
          console.warn(`[SVOR Upload]   ${index + 1}. ${error}`)
        })
      }
      
      if (!parseResult.success || parseResult.positions.length === 0) {
        console.error('[SVOR Upload] ❌ Парсинг не удался или нет позиций')
        setParseErrors(parseResult.errors)
        setUploadResult({
          success: false,
          message: `Ошибки при парсинге файла: ${parseResult.errors.length} ошибок`,
          count: 0,
        })
        setIsUploading(false)
        return
      }
      
      // Логируем первые несколько позиций для отладки
      console.log('[SVOR Upload] 📋 Примеры позиций (первые 3):')
      parseResult.positions.slice(0, 3).forEach((pos, index) => {
        console.log(`[SVOR Upload]   ${index + 1}. ${pos.svorCode} - ${pos.svorName}`)
      })
      
      // Отправляем на сервер
      console.log('[SVOR Upload] 📤 Отправка на сервер...')
      console.log('[SVOR Upload] Количество позиций для отправки:', parseResult.positions.length)
      console.log('[SVOR Upload] Название документа:', svorNameFromFile)
      const uploadStartTime = Date.now()
      const result = await uploadSVORPositions(parseResult.positions, svorNameFromFile)
      const uploadDuration = Date.now() - uploadStartTime
      console.log('[SVOR Upload] ✅ Ответ от сервера получен за', uploadDuration, 'мс')
      console.log('[SVOR Upload] Результат:', {
        success: result.success,
        message: result.message,
        positionsCount: result.positions.length,
      })
      
      if (result.success) {
        console.log('[SVOR Upload] ✅ Успешно загружено позиций:', result.positions.length)
        if (result.positions.length > 0) {
          console.log('[SVOR Upload] Примеры загруженных позиций:')
          result.positions.slice(0, 3).forEach((pos, index) => {
            console.log(`[SVOR Upload]   ${index + 1}. ID: ${pos.id}, Код: ${pos.svorCode}, Название: ${pos.svorName}`)
          })
        }
      } else {
        console.error('[SVOR Upload] ❌ Ошибка загрузки:', result.message)
      }
      
      const totalDuration = Date.now() - startTime
      console.log('[SVOR Upload] ⏱️ Общее время загрузки:', totalDuration, 'мс', `(${(totalDuration / 1000).toFixed(2)} сек)`)
      
      setUploadResult({
        success: result.success,
        message: result.message,
        count: result.positions.length,
      })
      
      if (result.success && onUploadComplete) {
        console.log('[SVOR Upload] 🔔 Вызов callback onUploadComplete')
        onUploadComplete()
      }
      
      // Показываем предупреждения, если есть
      if (parseResult.errors.length > 0) {
        setParseErrors(parseResult.errors)
      }
      
      console.log('[SVOR Upload] ========================================')
      
    } catch (error: any) {
      const totalDuration = Date.now() - startTime
      console.error('[SVOR Upload] ========================================')
      console.error('[SVOR Upload] ❌ КРИТИЧЕСКАЯ ОШИБКА загрузки СВОР')
      console.error('[SVOR Upload] Время до ошибки:', totalDuration, 'мс')
      console.error('[SVOR Upload] Тип ошибки:', error?.name || 'Unknown')
      console.error('[SVOR Upload] Сообщение:', error?.message || 'Неизвестная ошибка')
      console.error('[SVOR Upload] Стек ошибки:', error)
      if (error?.stack) {
        console.error('[SVOR Upload] Stack trace:', error.stack)
      }
      console.error('[SVOR Upload] ========================================')
      
      setUploadResult({
        success: false,
        message: error.message || 'Не удалось загрузить файл',
        count: 0,
      })
    } finally {
      setIsUploading(false)
      // Сбрасываем input для возможности повторной загрузки того же файла
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const downloadTemplate = () => {
    const template = `svor_code,svor_name,svor_description
01.01.001,Стена кирпичная,Стена из кирпича толщиной 250мм
01.01.002,Стена бетонная,Стена из бетона толщиной 200мм
01.02.001,Перегородка гипсокартонная,Перегородка из гипсокартона
02.01.001,Окно пластиковое,Окно ПВХ
03.01.001,Дверь металлическая,Дверь металлическая`
    
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'SVOR_template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">Загрузка позиций СВОР</h3>
          <p className="text-sm text-[#999]">
            Загрузите CSV файл с позициями СВОР. Обязательные колонки: <code className="text-primary-400">svor_code</code>, <code className="text-primary-400">svor_name</code>
          </p>
        </div>
        <Button
          variant="outline"
          onClick={downloadTemplate}
          className="border-[rgba(255,255,255,0.2)] text-sm"
        >
          <Download className="w-4 h-4 mr-2" />
          Скачать шаблон
        </Button>
      </div>

      <div className="border border-[rgba(255,255,255,0.1)] rounded-lg p-6 bg-[rgba(0,0,0,0.2)]">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
          id="svor-upload-input"
        />
        <label
          htmlFor="svor-upload-input"
          className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[rgba(255,255,255,0.2)] rounded-lg cursor-pointer hover:border-primary-500 transition-colors"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
              <span className="text-sm text-[#ccc]">Загрузка...</span>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-[#666] mb-2" />
              <span className="text-sm text-white mb-1">Нажмите для выбора файла</span>
              <span className="text-xs text-[#999]">CSV файл</span>
            </>
          )}
        </label>
      </div>

      {uploadResult && (
        <div
          className={`p-4 rounded-lg border ${
            uploadResult.success
              ? 'bg-[rgba(34,197,94,0.1)] border-[rgba(34,197,94,0.3)]'
              : 'bg-[rgba(239,68,68,0.1)] border-[rgba(239,68,68,0.3)]'
          }`}
        >
          <div className="flex items-start gap-3">
            {uploadResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${uploadResult.success ? 'text-green-400' : 'text-red-400'}`}>
                {uploadResult.message}
              </p>
              {uploadResult.success && uploadResult.count > 0 && (
                <p className="text-xs text-[#999] mt-1">
                  Загружено позиций: {uploadResult.count}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="p-4 rounded-lg border bg-[rgba(251,191,36,0.1)] border-[rgba(251,191,36,0.3)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-400 mb-2">
                Предупреждения при парсинге ({parseErrors.length}):
              </p>
              <ul className="text-xs text-[#999] space-y-1 max-h-32 overflow-y-auto">
                {parseErrors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

