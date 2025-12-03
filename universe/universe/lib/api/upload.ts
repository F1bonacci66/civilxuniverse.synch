// API клиент для загрузки файлов и конвертации

import type {
  FileUpload,
  ConversionJob,
  UploadFileRequest,
  UploadFileResponse,
  UploadProgress,
  ConversionStatus,
  ExportSettings,
  FileMetadata,
  ConversionLog,
  ProjectConversionStatus,
  QueueStatus,
} from '../types/upload'
import { getAuthHeaders } from './auth'
import { apiGet } from './client'

// Используем прямой URL к backend
// В production можно настроить через переменную окружения или использовать nginx reverse proxy
// Если API URL указывает на localhost, используем относительный путь для проксирования через Next.js
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/datalab'
const API_BASE_URL = rawApiUrl.includes('localhost') || rawApiUrl.includes('127.0.0.1') 
  ? '/api/datalab'  // Используем относительный путь для проксирования
  : rawApiUrl       // Используем полный URL для production

// Загрузить файл (используем XMLHttpRequest для лучшей поддержки больших файлов)
export async function uploadFile(
  request: UploadFileRequest
): Promise<UploadFileResponse> {
  const uploadUrl = `${API_BASE_URL}/upload`
  console.log('uploadFile вызван:', {
    fileName: request.file.name,
    fileSize: request.file.size,
    projectId: request.projectId,
    versionId: request.versionId,
    autoConvert: request.autoConvert,
    uploadUrl,
    API_BASE_URL,
  })

  const formData = new FormData()
  formData.append('file', request.file)
  formData.append('projectId', request.projectId)
  formData.append('versionId', request.versionId)
  
  // Добавляем названия для читаемых путей
  if (request.projectName) {
    formData.append('projectName', request.projectName)
  }
  if (request.versionName) {
    formData.append('versionName', request.versionName)
  }
  
  if (request.exportSettingsId) {
    formData.append('exportSettingsId', request.exportSettingsId)
  }
  
  if (request.autoConvert !== undefined) {
    formData.append('autoConvert', String(request.autoConvert))
  }
  
  // Добавляем userId (временно используем дефолтный UUID)
  formData.append('userId', '00000000-0000-0000-0000-000000000000')

  console.log('Отправка запроса на:', uploadUrl)
  
  // Используем fetch API - он лучше обрабатывает CORS и дает более понятные ошибки
  try {
    console.log('Начинаем fetch запрос...', {
      url: uploadUrl,
      method: 'POST',
      fileSize: request.file.size,
      fileName: request.file.name,
    })
    
    const fetchStartTime = Date.now()
    console.log('⏱️ Fetch start time:', fetchStartTime)
    
    // Загрузка файла не требует таймаута - она должна завершиться быстро
    // Таймаут нужен только для длительных операций конвертации
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      // НЕ устанавливаем Content-Type - браузер сам установит с boundary
      // Не устанавливаем другие заголовки - это может вызвать preflight
    })
    const fetchDuration = Date.now() - fetchStartTime
    console.log(`✅ Response получен за ${fetchDuration}ms:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Upload error response:', errorText)
      let errorMessage = 'Ошибка загрузки файла'
      try {
        const errorData = JSON.parse(errorText)
        errorMessage = errorData.detail || errorData.message || errorMessage
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`
      }
      throw new Error(errorMessage)
    }
    
    const data = await response.json()
    console.log('✅ Файл загружен:', data)
    return data
  } catch (error) {
    console.error('❌ Ошибка при загрузке файла:', error)
    
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
    }
    
    if (error instanceof TypeError) {
      if (error.message.includes('Failed to fetch')) {
        throw new Error(
          'Не удалось подключиться к серверу. Проверьте:\n' +
          '1. Запущен ли backend сервер на http://localhost:8000\n' +
          '2. Нет ли проблем с CORS (проверьте консоль браузера и Network tab)\n' +
          '3. Не блокирует ли антивирус/брандмауэр подключение\n' +
          '4. Проверьте Network tab - должен появиться OPTIONS запрос (preflight)'
        )
      }
      if (error.message.includes('aborted')) {
        throw new Error('Запрос был отменен (таймаут). Возможно, сервер не отвечает.')
      }
    }
    
    throw error
  }
}

// Получить статус загрузки и конвертации
export async function getUploadProgress(
  fileUploadId: string
): Promise<UploadProgress> {
  const response = await fetch(`${API_BASE_URL}/upload/${fileUploadId}/progress`)

  if (!response.ok) {
    throw new Error('Ошибка получения статуса загрузки')
  }

  return response.json()
}

// Получить список загруженных файлов
export async function getFileUploads(
  projectId?: string,
  versionId?: string
): Promise<FileUpload[]> {
  const params = new URLSearchParams()
  if (projectId) params.append('projectId', projectId)
  if (versionId) params.append('versionId', versionId)

  const url = `${API_BASE_URL}/upload${params.toString() ? `?${params.toString()}` : ''}`
  
  console.log('📡 Запрос файлов:', url)
  
  const response = await fetch(url)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ Ошибка получения файлов:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    })
    throw new Error(`Ошибка получения списка файлов: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  console.log('✅ Получены файлы:', data.length, 'шт.')
  
  // Преобразуем snake_case в camelCase для frontend
  return data.map((file: any) => ({
    id: file.id,
    userId: file.user_id,
    projectId: file.project_id,
    versionId: file.version_id,
    originalFilename: file.original_filename,
    fileType: file.file_type, // Преобразуем file_type в fileType
    fileSize: file.file_size,
    mimeType: file.mime_type,
    storagePath: file.storage_path,
    storageBucket: file.storage_bucket,
    uploadStatus: file.upload_status,
    errorMessage: file.error_message,
    modelId: file.model_id,
    uploadedAt: file.uploaded_at,
    completedAt: file.completed_at,
  }))
}

// Получить информацию о файле
export async function getFileUpload(fileUploadId: string): Promise<FileUpload> {
  const response = await fetch(`${API_BASE_URL}/upload/${fileUploadId}`)

  if (!response.ok) {
    throw new Error('Ошибка получения информации о файле')
  }

  return response.json()
}

// Начать конвертацию файла
export async function startConversion(
  fileUploadId: string,
  conversionType: 'RVT_TO_IFC' | 'IFC_TO_CSV' | 'RVT_TO_CSV',
  exportSettingsId?: string
): Promise<ConversionJob> {
  const response = await fetch(`${API_BASE_URL}/conversion/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileUploadId,
      conversionType,
      exportSettingsId,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Ошибка запуска конвертации' }))
    throw new Error(error.message || 'Ошибка запуска конвертации')
  }

  return response.json()
}

// Получить статус конвертации
export async function getConversionJob(jobId: string): Promise<ConversionJob> {
  const response = await fetch(`${API_BASE_URL}/conversion/${jobId}`)

  if (!response.ok) {
    throw new Error('Ошибка получения статуса конвертации')
  }

  return response.json()
}

export async function getProjectConversions(
  projectId: string,
  options: {
    versionId?: string
    limit?: number
    activeOnly?: boolean
  } = {}
): Promise<ProjectConversionStatus[]> {
  const params = new URLSearchParams()
  if (options.versionId) params.append('version_id', options.versionId)
  if (options.limit) params.append('limit', String(options.limit))
  if (typeof options.activeOnly === 'boolean') {
    params.append('active_only', String(options.activeOnly))
  }
  const url = `${API_BASE_URL}/conversion/project/${projectId}${
    params.toString() ? `?${params.toString()}` : ''
  }`

  const response = await fetch(url)
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    if (response.status === 404) {
      console.warn(
        '[ConversionStatus] Проект или версия не найдены при запросе статусов, возвращаем пустой список',
        {
          projectId,
          versionId: options.versionId,
          limit: options.limit,
          activeOnly: options.activeOnly,
          responseText: errorText,
        }
      )
      return []
    }
    throw new Error(
      `Ошибка получения статусов конвертации (${response.status} ${response.statusText})${
        errorText ? `: ${errorText}` : ''
      }`
    )
  }

  return response.json()
}

// Получить статус очереди конвертаций
export async function getQueueStatus(): Promise<QueueStatus> {
  // Увеличиваем таймаут до 15 секунд для надежности при высокой нагрузке
  return apiGet<QueueStatus>('/conversion/queue/status', 15000)
}

export async function getConversionLogs(
  jobId: string,
  limit = 50
): Promise<ConversionLog[]> {
  const url = `${API_BASE_URL}/conversion/${jobId}/logs?limit=${limit}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Ошибка получения логов конвертации')
  }

  return response.json()
}

// Отменить конвертацию
export async function cancelConversion(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/conversion/${jobId}/cancel`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error('Ошибка отмены конвертации')
  }
}

// Удалить файл
export async function deleteFileUpload(fileUploadId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/upload/${fileUploadId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Ошибка удаления файла')
  }
}

// Получить настройки экспорта
export async function getExportSettings(
  userId?: string
): Promise<ExportSettings[]> {
  const params = userId ? `?userId=${userId}` : ''
  const response = await fetch(`${API_BASE_URL}/export-settings${params}`)

  if (!response.ok) {
    throw new Error('Ошибка получения настроек экспорта')
  }

  return response.json()
}

// Создать настройки экспорта
export async function createExportSettings(
  settings: Omit<ExportSettings, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ExportSettings> {
  const response = await fetch(`${API_BASE_URL}/export-settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Ошибка создания настроек' }))
    throw new Error(error.message || 'Ошибка создания настроек')
  }

  return response.json()
}

// Обновить настройки экспорта
export async function updateExportSettings(
  settingsId: string,
  settings: Partial<ExportSettings>
): Promise<ExportSettings> {
  const response = await fetch(`${API_BASE_URL}/export-settings/${settingsId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Ошибка обновления настроек' }))
    throw new Error(error.message || 'Ошибка обновления настроек')
  }

  return response.json()
}

// Удалить настройки экспорта
export async function deleteExportSettings(settingsId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/export-settings/${settingsId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Ошибка удаления настроек')
  }
}

// Получить метаданные файла
export async function getFileMetadata(fileUploadId: string): Promise<FileMetadata> {
  const response = await fetch(`${API_BASE_URL}/upload/${fileUploadId}/metadata`)

  if (!response.ok) {
    throw new Error('Ошибка получения метаданных файла')
  }

  return response.json()
}

// Скачать файл
export async function downloadFile(
  fileUploadId: string,
  filename?: string
): Promise<Blob> {
  console.log('[downloadFile] Начало загрузки файла:', { fileUploadId, filename })
  
  try {
    const response = await fetch(`${API_BASE_URL}/upload/${fileUploadId}/download`, {
      headers: {
        ...getAuthHeaders(),
      },
    })

    console.log('[downloadFile] Ответ сервера:', { 
      status: response.status, 
      statusText: response.statusText,
      ok: response.ok 
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Не удалось прочитать ошибку')
      console.error('[downloadFile] Ошибка ответа:', errorText)
      throw new Error(`Ошибка скачивания файла: ${response.status} ${response.statusText}`)
    }

    const blob = await response.blob()
    console.log('[downloadFile] Blob создан:', { 
      size: blob.size, 
      type: blob.type 
    })
    
    // Автоматически скачать файл
    if (filename) {
      try {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.style.display = 'none'
        document.body.appendChild(a)
        console.log('[downloadFile] Запуск скачивания:', filename)
        a.click()
        
        // Очистка после небольшой задержки
        setTimeout(() => {
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
          console.log('[downloadFile] Скачивание завершено')
        }, 100)
      } catch (downloadError) {
        console.error('[downloadFile] Ошибка при создании ссылки для скачивания:', downloadError)
        throw new Error(`Не удалось инициировать скачивание: ${downloadError}`)
      }
    }

    return blob
  } catch (error) {
    console.error('[downloadFile] Общая ошибка:', error)
    throw error
  }
}

