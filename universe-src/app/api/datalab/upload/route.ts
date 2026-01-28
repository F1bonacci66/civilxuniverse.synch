// Next.js API Route для проксирования запросов загрузки файлов
// Это обходит проблему CORS, так как запрос идет на тот же домен

import { NextRequest, NextResponse } from 'next/server'

// Увеличиваем таймаут для больших файлов (до 700MB)
export const maxDuration = 900 // 15 минут для очень больших файлов (до 700+ MB)

// Используем прямой URL к backend
// В Docker контейнере на Linux используем 172.17.0.1 (Docker bridge), на хосте - localhost
// host.docker.internal работает только на Docker Desktop (Windows/Mac), не на Linux
const getBackendUrl = () => {
  const BACKEND_HOST = process.env.DOCKER_CONTAINER === 'true' 
    ? 'http://172.17.0.1:8000'  // Docker bridge IP для Linux
    : 'http://localhost:8000'
  const BACKEND_URL = `${BACKEND_HOST}/api/datalab/upload`
  
  console.log('[Upload Route] getBackendUrl:', {
    BACKEND_HOST,
    BACKEND_URL,
    DOCKER_CONTAINER: process.env.DOCKER_CONTAINER,
  })
  
  return BACKEND_URL
}


// Отключаем body parsing для больших файлов - используем streaming
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  // Логируем СРАЗУ при получении запроса - это поможет понять, доходит ли запрос до handler
  console.log(`📥 [${requestId}] ========== POST /api/datalab/upload ПОЛУЧЕН ==========`)
  console.log(`📥 [${requestId}] Время: ${new Date().toISOString()}`)
  console.log(`📥 [${requestId}] URL: ${request.url}`)
  console.log(`📥 [${requestId}] Method: ${request.method}`)
  
  try {
    // Проверяем подключение к backend перед отправкой (опционально)
    // Убираем проверку, так как она может вызывать проблемы с таймаутом
    // Если backend недоступен, запрос сам упадет с ошибкой
    console.log(`⏭️  [${requestId}] Пропускаем health check, сразу пересылаем запрос`)
    
    // Получаем тело запроса как поток (streaming) для больших файлов
    console.log(`📥 [${requestId}] Получаем тело запроса как поток...`)
    
    // Получаем Content-Type из оригинального запроса (с boundary!)
    const contentType = request.headers.get('content-type')
    if (!contentType) {
      console.error(`❌ [${requestId}] Content-Type header is missing`)
      return NextResponse.json(
        { detail: 'Content-Type header is missing' },
        { status: 400 }
      )
    }
    
    // Получаем Content-Length для логирования
    const contentLength = request.headers.get('content-length')
    const contentLengthMB = contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(2) + ' MB' : 'unknown'
    console.log(`📋 [${requestId}] Content-Type: ${contentType.substring(0, 100)}...`)
    console.log(`📋 [${requestId}] Content-Length: ${contentLength} байт (${contentLengthMB})`)
    
    const BACKEND_URL = getBackendUrl()
    console.log(`📤 [${requestId}] Пересылаем запрос на: ${BACKEND_URL}`)
    console.log(`⏳ [${requestId}] Отправляем запрос на backend через streaming...`)
    
    try {
      // Используем streaming подход для больших файлов
      // Передаем поток напрямую, без чтения всего файла в память
      const fetchStartTime = Date.now()
      console.log(`⏱️  [${requestId}] Начало streaming запроса к backend в ${new Date().toISOString()}`)
      if (contentLength) {
        console.log(`⏱️  [${requestId}] Размер тела: ${contentLength} байт (${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB)`)
      }
      
      // Используем встроенный модуль http Node.js для streaming
      console.log(`⏱️  [${requestId}] Отправляем запрос на backend через http модуль (streaming)...`)
      
      const http = await import('http')
      const url = new URL(BACKEND_URL)
      
      const backendResponse = await new Promise<{
        statusCode: number
        statusMessage: string
        headers: Record<string, string>
        body: string
      }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': contentType,
              ...(contentLength && { 'Content-Length': contentLength }),
            },
            timeout: 900000, // 15 минут для очень больших файлов (до 700+ MB)
          },
          (res) => {
            let responseBody = ''
            res.on('data', (chunk) => {
              responseBody += chunk.toString()
            })
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode || 500,
                statusMessage: res.statusMessage || 'Unknown',
                headers: res.headers as Record<string, string>,
                body: responseBody,
              })
            })
          }
        )
        
        req.on('error', (error) => {
          console.error(`❌ [${requestId}] HTTP request error:`, error)
          reject(error)
        })
        
        req.on('timeout', () => {
          console.error(`❌ [${requestId}] HTTP request timeout`)
          req.destroy()
          reject(new Error('Request timeout'))
        })
        
        // Используем streaming - передаем request.body напрямую
        // request.body - это ReadableStream, который можно читать по частям
        if (request.body) {
          const reader = request.body.getReader()
          let totalBytes = 0
          
          const pump = async () => {
            try {
              const contentLengthNum = contentLength ? parseInt(contentLength) : 0
              let lastLoggedPercent = -1
              let lastActivityTime = Date.now()
              // Увеличиваем таймаут бездействия до 15 минут для поддержки медленных загрузок больших файлов
              // При скорости 1 МБ/с файл 665 МБ загрузится за ~11 минут, поэтому 15 минут достаточно
              const ACTIVITY_TIMEOUT = 900000 // 15 минут без активности = таймаут
              
              // Логируем каждые 5% прогресса
              while (true) {
                // Проверяем таймаут бездействия
                const timeSinceLastActivity = Date.now() - lastActivityTime
                if (timeSinceLastActivity > ACTIVITY_TIMEOUT) {
                  console.error(`❌ [${requestId}] Таймаут чтения потока: нет активности ${Math.round(timeSinceLastActivity / 1000)} секунд`)
                  console.error(`❌ [${requestId}] Отправлено: ${(totalBytes / 1024 / 1024).toFixed(2)} MB из ${(contentLengthNum / 1024 / 1024).toFixed(2)} MB (${Math.round((totalBytes / contentLengthNum) * 100)}%)`)
                  throw new Error(`Таймаут чтения потока: нет активности ${Math.round(timeSinceLastActivity / 1000)} секунд`)
                }
                
                // Логируем предупреждение, если нет активности более 2 минут (но еще не таймаут)
                if (timeSinceLastActivity > 120000 && timeSinceLastActivity <= ACTIVITY_TIMEOUT) {
                  console.warn(`⚠️ [${requestId}] Долгое ожидание данных: ${Math.round(timeSinceLastActivity / 1000)} секунд без активности (отправлено: ${(totalBytes / 1024 / 1024).toFixed(2)} MB)`)
                }
                
                const readStartTime = Date.now()
                const { done, value } = await reader.read()
                const readDuration = Date.now() - readStartTime
                
                // Если чтение заняло больше 30 секунд, логируем предупреждение
                if (readDuration > 30000) {
                  console.warn(`⚠️ [${requestId}] Медленное чтение потока: ${readDuration}ms, отправлено: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`)
                }
                
                if (done) {
                  console.log(`✅ [${requestId}] Тело запроса отправлено полностью (${totalBytes} байт / ${contentLengthNum} байт)`)
                  req.end()
                  break
                }
                
                if (value) {
                  totalBytes += value.length
                  lastActivityTime = Date.now() // Обновляем время последней активности
                  
                  // Логируем прогресс каждые 5%
                  if (contentLengthNum > 0) {
                    const percent = Math.round((totalBytes / contentLengthNum) * 100)
                    if (percent - lastLoggedPercent >= 5 || percent === 100) {
                      console.log(`📊 [${requestId}] Прогресс отправки: ${percent}% (${(totalBytes / 1024 / 1024).toFixed(2)} MB / ${(contentLengthNum / 1024 / 1024).toFixed(2)} MB)`)
                      lastLoggedPercent = percent
                    }
                  }
                  
                  const writeStartTime = Date.now()
                  const canContinue = req.write(Buffer.from(value))
                  const writeDuration = Date.now() - writeStartTime
                  
                  // Если запись заняла больше 10 секунд, логируем предупреждение
                  if (writeDuration > 10000) {
                    console.warn(`⚠️ [${requestId}] Медленная запись в backend: ${writeDuration}ms`)
                  }
                  
                  if (!canContinue) {
                    // Ждем события 'drain' перед продолжением (с таймаутом)
                    // Увеличиваем таймаут до 5 минут для больших файлов, когда backend медленно обрабатывает данные
                    console.log(`⏳ [${requestId}] Буфер переполнен, ждем drain... (отправлено: ${(totalBytes / 1024 / 1024).toFixed(2)} MB)`)
                    await Promise.race([
                      new Promise<void>((resolve) => {
                        req.once('drain', () => {
                          console.log(`✅ [${requestId}] Drain произошел, продолжаем отправку`)
                          resolve()
                        })
                      }),
                      new Promise<void>((_, reject) => {
                        setTimeout(() => reject(new Error('Таймаут ожидания drain (5 минут)')), 300000) // 5 минут
                      })
                    ])
                  }
                } else {
                  // Если value пустой, но done = false, обновляем время активности
                  lastActivityTime = Date.now()
                }
              }
            } catch (error: any) {
              console.error(`❌ [${requestId}] Ошибка при чтении потока:`, error)
              console.error(`❌ [${requestId}] Отправлено байт до ошибки: ${totalBytes}`)
              console.error(`❌ [${requestId}] Stack:`, error.stack)
              if (!req.destroyed) {
                req.destroy()
              }
              reject(error)
            }
          }
          
          pump()
        } else {
          // Если body нет, просто закрываем запрос
          req.end()
        }
      })
      
      const fetchDuration = Date.now() - fetchStartTime
      console.log(`⏱️  [${requestId}] HTTP запрос завершен за ${fetchDuration}ms`)

      console.log(`📥 [${requestId}] Ответ от backend получен: ${backendResponse.statusCode} ${backendResponse.statusMessage}`)
      console.log(`📥 [${requestId}] Размер ответа: ${backendResponse.body.length} байт`)
      
      if (backendResponse.statusCode !== undefined && (backendResponse.statusCode < 200 || backendResponse.statusCode >= 300)) {
        console.error(`❌ [${requestId}] Backend вернул ошибку: ${backendResponse.statusCode} ${backendResponse.statusMessage}`)
        console.error(`❌ [${requestId}] Тело ответа (первые 1000 символов): ${backendResponse.body.substring(0, 1000)}`)
        
        // Пытаемся распарсить JSON из ответа с ошибкой
        let errorDetail = `Backend error: ${backendResponse.statusCode} ${backendResponse.statusMessage}`
        try {
          const errorData = JSON.parse(backendResponse.body)
          if (errorData.detail) {
            errorDetail = errorData.detail
          } else if (errorData.error_message) {
            errorDetail = errorData.error_message
          } else if (errorData.message) {
            errorDetail = errorData.message
          }
          console.error(`❌ [${requestId}] Детали ошибки из JSON: ${errorDetail}`)
        } catch (parseError) {
          console.error(`❌ [${requestId}] Не удалось распарсить JSON ошибки: ${parseError}`)
          // Используем первые 500 символов тела ответа как детали ошибки
          errorDetail = backendResponse.body.substring(0, 500)
        }
        
        return NextResponse.json(
          { 
            detail: errorDetail,
            status: backendResponse.statusCode,
            statusText: backendResponse.statusMessage,
            errorDetails: backendResponse.body.length > 0 ? backendResponse.body.substring(0, 1000) : 'Empty response body'
          },
          { status: backendResponse.statusCode }
        )
      }

      // Получаем ответ
      console.log(`📥 [${requestId}] Читаем JSON ответ от backend...`)
      let data
      try {
        data = JSON.parse(backendResponse.body)
        console.log(`✅ [${requestId}] Данные от backend получены, возвращаем клиенту`)
      } catch (parseError: any) {
        console.error(`❌ [${requestId}] Ошибка парсинга JSON ответа: ${parseError}`)
        console.error(`❌ [${requestId}] Тело ответа (первые 500 символов): ${backendResponse.body.substring(0, 500)}`)
        return NextResponse.json(
          { 
            detail: `Ошибка парсинга ответа от backend: ${parseError.message}`,
            rawResponse: backendResponse.body.substring(0, 500)
          },
          { status: 500 }
        )
      }

      // Возвращаем ответ с теми же заголовками
      return NextResponse.json(data, {
        status: backendResponse.statusCode || 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
    } catch (fetchError: any) {
      const errorType = fetchError.name || 'Unknown'
      const errorMessage = fetchError.message || 'Unknown error'
      const errorStack = fetchError.stack || 'No stack trace'
      
      console.error(`❌ [${requestId}] Ошибка fetch к backend:`)
      console.error(`   Тип: ${errorType}`)
      console.error(`   Сообщение: ${errorMessage}`)
      console.error(`   Stack: ${errorStack}`)
      
      if (fetchError.name === 'AbortError' || fetchError.message === 'Request timeout' || fetchError.message?.includes('timeout')) {
        console.error(`❌ [${requestId}] Таймаут при запросе к backend`)
        return NextResponse.json(
          { 
            detail: 'Таймаут при запросе к backend',
            errorType: 'TimeoutError',
            errorMessage: errorMessage
          },
          { status: 504 }
        )
      }
      
      if (fetchError.code === 'ECONNREFUSED' || fetchError.message?.includes('ECONNREFUSED')) {
        console.error(`❌ [${requestId}] Backend недоступен (connection refused)`)
        return NextResponse.json(
          { 
            detail: 'Backend сервер недоступен. Проверьте, запущен ли backend на порту 8000',
            errorType: 'ConnectionError',
            errorMessage: errorMessage
          },
          { status: 503 }
        )
      }
      
      // Для других ошибок возвращаем 500 с деталями
      return NextResponse.json(
        { 
          detail: `Ошибка при запросе к backend: ${errorMessage}`,
          errorType: errorType,
          errorMessage: errorMessage
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    const errorType = error.name || 'Unknown'
    const errorMessage = error.message || 'Unknown error'
    const errorStack = error.stack || 'No stack trace'
    
    console.error(`❌ [${requestId}] Критическая ошибка проксирования запроса:`)
    console.error(`   Тип: ${errorType}`)
    console.error(`   Сообщение: ${errorMessage}`)
    console.error(`   Stack: ${errorStack}`)
    
    return NextResponse.json(
      { 
        detail: `Ошибка проксирования: ${errorMessage}`,
        errorType: errorType,
        errorMessage: errorMessage
      },
      { status: 500 }
    )
  }
}

// GET handler для получения списка файлов
export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  console.log(`📥 [${requestId}] Next.js API route: GET /api/datalab/upload получен`)
  
  try {
    // Получаем query параметры из запроса
    const searchParams = request.nextUrl.searchParams
    const queryString = searchParams.toString()
    const BACKEND_URL = getBackendUrl()
    const backendUrl = `${BACKEND_URL}${queryString ? `?${queryString}` : ''}`
    
    console.log(`📤 [${requestId}] Проксируем GET запрос на: ${backendUrl}`)
    
    // Проксируем GET запрос к бэкенду
    const http = await import('http')
    const url = new URL(backendUrl)
    
    const backendResponse = await new Promise<{
      statusCode: number
      statusMessage: string
      headers: Record<string, string>
      body: string
    }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: 'GET',
          timeout: 120000, // 120 секунд (может быть медленным из-за подключения к удаленной БД на dev сервере)
        },
        (res) => {
          let responseBody = ''
          res.on('data', (chunk) => {
            responseBody += chunk.toString()
          })
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 500,
              statusMessage: res.statusMessage || 'Unknown',
              headers: res.headers as Record<string, string>,
              body: responseBody,
            })
          })
        }
      )
      
      req.on('error', (error) => {
        reject(error)
      })
      
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })
      
      req.end()
    })
    
    console.log(`📥 [${requestId}] Ответ от backend: ${backendResponse.statusCode}`)
    
    if (backendResponse.statusCode !== undefined && (backendResponse.statusCode < 200 || backendResponse.statusCode >= 300)) {
      console.error(`❌ [${requestId}] Backend вернул ошибку: ${backendResponse.body}`)
      return NextResponse.json(
        { detail: `Backend error: ${backendResponse.statusCode} ${backendResponse.statusMessage}` },
        { status: backendResponse.statusCode }
      )
    }
    
    // Парсим JSON ответ
    const data = JSON.parse(backendResponse.body)
    console.log(`✅ [${requestId}] Данные получены, возвращаем клиенту`)
    
    return NextResponse.json(data, {
      status: backendResponse.statusCode || 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error: any) {
    console.error(`❌ [${requestId}] Ошибка проксирования GET запроса:`, error)
    return NextResponse.json(
      { detail: `Ошибка проксирования: ${error.message}` },
      { status: 500 }
    )
  }
}

// OPTIONS handler для CORS preflight
export async function OPTIONS(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  console.log(`🔵 [${requestId}] OPTIONS запрос получен для /api/datalab/upload`)
  const origin = request.headers.get('origin') || '*'
  console.log(`🔵 [${requestId}] Origin: ${origin}`)
  
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '3600',
    },
  })
}





