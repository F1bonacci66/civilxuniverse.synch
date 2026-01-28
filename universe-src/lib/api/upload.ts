﻿// API РєР»РёРµРЅС‚ РґР»СЏ Р·Р°РіСЂСѓР·РєРё С„Р°Р№Р»РѕРІ Рё РєРѕРЅРІРµСЂС‚Р°С†РёРё

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

// РСЃРїРѕР»СЊР·СѓРµРј РїСЂСЏРјРѕР№ URL Рє backend
// Р’ production РјРѕР¶РЅРѕ РЅР°СЃС‚СЂРѕРёС‚СЊ С‡РµСЂРµР· РїРµСЂРµРјРµРЅРЅСѓСЋ РѕРєСЂСѓР¶РµРЅРёСЏ РёР»Рё РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ nginx reverse proxy
// Р•СЃР»Рё API URL СѓРєР°Р·С‹РІР°РµС‚ РЅР° localhost РёР»Рё СЏРІР»СЏРµС‚СЃСЏ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Рј РїСѓС‚РµРј, РёСЃРїРѕР»СЊР·СѓРµРј РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Р№ РїСѓС‚СЊ РґР»СЏ РїСЂРѕРєСЃРёСЂРѕРІР°РЅРёСЏ С‡РµСЂРµР· Next.js
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/datalab'
const API_BASE_URL = rawApiUrl.includes('localhost') || rawApiUrl.includes('127.0.0.1') || rawApiUrl.startsWith('/')
  ? '/api/datalab'  // РСЃРїРѕР»СЊР·СѓРµРј РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Р№ РїСѓС‚СЊ РґР»СЏ РїСЂРѕРєСЃРёСЂРѕРІР°РЅРёСЏ
  : rawApiUrl       // РСЃРїРѕР»СЊР·СѓРµРј РїРѕР»РЅС‹Р№ URL РґР»СЏ production

// Р—Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р» (РёСЃРїРѕР»СЊР·СѓРµРј XMLHttpRequest РґР»СЏ Р»СѓС‡С€РµР№ РїРѕРґРґРµСЂР¶РєРё Р±РѕР»СЊС€РёС… С„Р°Р№Р»РѕРІ)
export async function uploadFile(
  request: UploadFileRequest
): Promise<UploadFileResponse> {
  const uploadUrl = `${API_BASE_URL}/upload/`  // Р”РѕР±Р°РІР»СЏРµРј trailing slash, С‡С‚РѕР±С‹ РёР·Р±РµР¶Р°С‚СЊ 308 СЂРµРґРёСЂРµРєС‚Р°
  console.log('uploadFile РІС‹Р·РІР°РЅ:', {
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
  
  // Р”РѕР±Р°РІР»СЏРµРј РЅР°Р·РІР°РЅРёСЏ РґР»СЏ С‡РёС‚Р°РµРјС‹С… РїСѓС‚РµР№
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
  
  // Р”РѕР±Р°РІР»СЏРµРј userId (РІСЂРµРјРµРЅРЅРѕ РёСЃРїРѕР»СЊР·СѓРµРј РґРµС„РѕР»С‚РЅС‹Р№ UUID)
  formData.append('userId', '00000000-0000-0000-0000-000000000000')

  console.log('РћС‚РїСЂР°РІРєР° Р·Р°РїСЂРѕСЃР° РЅР°:', uploadUrl)
  
  // Р•СЃР»Рё РЅСѓР¶РµРЅ РїСЂРѕРіСЂРµСЃСЃ, РёСЃРїРѕР»СЊР·СѓРµРј XMLHttpRequest (РїРѕРґРґРµСЂР¶РёРІР°РµС‚ РѕС‚СЃР»РµР¶РёРІР°РЅРёРµ РїСЂРѕРіСЂРµСЃСЃР°)
  // РРЅР°С‡Рµ РёСЃРїРѕР»СЊР·СѓРµРј fetch API (Р»СѓС‡С€Рµ РґР»СЏ CORS Рё РѕС€РёР±РѕРє)
  if (request.onProgress) {
    return new Promise<UploadFileResponse>((resolve, reject) => {
      console.log('РќР°С‡РёРЅР°РµРј XMLHttpRequest Р·Р°РїСЂРѕСЃ СЃ РѕС‚СЃР»РµР¶РёРІР°РЅРёРµРј РїСЂРѕРіСЂРµСЃСЃР°...', {
        url: uploadUrl,
        method: 'POST',
        fileSize: request.file.size,
        fileName: request.file.name,
      })
      
      const xhr = new XMLHttpRequest()
      const uploadStartTime = Date.now()
      
      // РЈСЃС‚Р°РЅР°РІР»РёРІР°РµРј С‚Р°Р№РјР°СѓС‚ РґР»СЏ Р±РѕР»СЊС€РёС… С„Р°Р№Р»РѕРІ (30 РјРёРЅСѓС‚ = 1800000 РјСЃ)
      // Р­С‚Рѕ РєСЂРёС‚РёС‡РЅРѕ РґР»СЏ С„Р°Р№Р»РѕРІ 665 РњР‘, РєРѕС‚РѕСЂС‹Рµ РјРѕРіСѓС‚ Р·Р°РіСЂСѓР¶Р°С‚СЊСЃСЏ РґРѕР»РіРѕ
      xhr.timeout = 1800000 // 30 РјРёРЅСѓС‚
      
      // РћР±СЂР°Р±РѕС‚РєР° С‚Р°Р№РјР°СѓС‚Р°
      xhr.addEventListener('timeout', () => {
        const uploadDuration = Date.now() - uploadStartTime
        console.error(`вќЊ [${new Date().toISOString()}] XMLHttpRequest TIMEOUT РїРѕСЃР»Рµ ${(uploadDuration / 1000).toFixed(2)} СЃРµРєСѓРЅРґ`, {
          uploadDuration: `${(uploadDuration / 1000).toFixed(2)}s`,
          timeout: `${(xhr.timeout / 1000).toFixed(0)}s`,
          xhrReadyState: xhr.readyState,
          xhrStatus: xhr.status,
          xhrStatusText: xhr.statusText,
          url: uploadUrl,
          fileSize: request.file.size,
          fileName: request.file.name,
        })
        reject(new Error(`РўР°Р№РјР°СѓС‚ Р·Р°РіСЂСѓР·РєРё С„Р°Р№Р»Р° (30 РјРёРЅСѓС‚). Р—Р°РіСЂСѓР·РєР° РґР»РёР»Р°СЃСЊ ${(uploadDuration / 1000).toFixed(2)} СЃРµРєСѓРЅРґ`))
      })
      
      // РћС‚СЃР»РµР¶РёРІР°РµРј РїСЂРѕРіСЂРµСЃСЃ Р·Р°РіСЂСѓР·РєРё (Р»РѕРіРёСЂСѓРµРј Рё РІС‹Р·С‹РІР°РµРј callback РєР°Р¶РґС‹Рµ 5%)
      let lastLoggedPercent = -1
      let lastProgressTime = Date.now()
      let lastLoadedBytes = 0
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100)
          const currentTime = Date.now()
          const timeSinceLastProgress = currentTime - lastProgressTime
          const bytesSinceLastProgress = event.loaded - lastLoadedBytes
          const speedMBps = timeSinceLastProgress > 0 
            ? (bytesSinceLastProgress / 1024 / 1024) / (timeSinceLastProgress / 1000)
            : 0
          
          // Р›РѕРіРёСЂСѓРµРј РєР°Р¶РґРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ РїСЂРѕРіСЂРµСЃСЃР° СЃ РґРµС‚Р°Р»СЊРЅРѕР№ РёРЅС„РѕСЂРјР°С†РёРµР№
          console.log(`рџ“Љ [${new Date().toISOString()}] РџСЂРѕРіСЂРµСЃСЃ Р·Р°РіСЂСѓР·РєРё: ${percentComplete}% (${(event.loaded / 1024 / 1024).toFixed(2)} MB / ${(event.total / 1024 / 1024).toFixed(2)} MB)`, {
            loaded: event.loaded,
            total: event.total,
            speed: `${speedMBps.toFixed(2)} MB/s`,
            timeSinceLastUpdate: `${(timeSinceLastProgress / 1000).toFixed(2)}s`,
            xhrReadyState: xhr.readyState,
            xhrStatus: xhr.status,
          })
          
          // Р’С‹Р·С‹РІР°РµРј callback Рё Р»РѕРіРёСЂСѓРµРј С‚РѕР»СЊРєРѕ РїСЂРё РёР·РјРµРЅРµРЅРёРё РЅР° 5% РёР»Рё Р±РѕР»СЊС€Рµ
          if (percentComplete - lastLoggedPercent >= 5 || percentComplete === 100 || lastLoggedPercent === -1) {
            if (request.onProgress) {
              request.onProgress(percentComplete)
            }
            console.log(`рџ“Љ РџСЂРѕРіСЂРµСЃСЃ Р·Р°РіСЂСѓР·РєРё: ${percentComplete}% (${(event.loaded / 1024 / 1024).toFixed(2)} MB / ${(event.total / 1024 / 1024).toFixed(2)} MB)`)
            lastLoggedPercent = percentComplete
          }
          
          lastProgressTime = currentTime
          lastLoadedBytes = event.loaded
          
          // РџСЂРµРґСѓРїСЂРµР¶РґРµРЅРёРµ, РµСЃР»Рё РїСЂРѕРіСЂРµСЃСЃ РѕСЃС‚Р°РЅРѕРІРёР»СЃСЏ Р±РѕР»РµРµ С‡РµРј РЅР° 30 СЃРµРєСѓРЅРґ
          if (timeSinceLastProgress > 30000 && percentComplete < 100) {
            console.warn(`вљ пёЏ [${new Date().toISOString()}] РџР РћР‘Р›Р•РњРђ: РџСЂРѕРіСЂРµСЃСЃ Р·Р°РіСЂСѓР·РєРё РЅРµ РѕР±РЅРѕРІР»СЏР»СЃСЏ ${(timeSinceLastProgress / 1000).toFixed(0)} СЃРµРєСѓРЅРґ!`, {
              currentPercent: percentComplete,
              xhrReadyState: xhr.readyState,
              xhrStatus: xhr.status,
              xhrStatusText: xhr.statusText,
            })
          }
        } else {
          console.warn(`вљ пёЏ [${new Date().toISOString()}] РџСЂРѕРіСЂРµСЃСЃ РЅРµ РІС‹С‡РёСЃР»РёРј:`, {
            loaded: event.loaded,
            total: event.total,
            lengthComputable: event.lengthComputable,
          })
        }
      })
      
      // РћР±СЂР°Р±РѕС‚РєР° СѓСЃРїРµС€РЅРѕРіРѕ РѕС‚РІРµС‚Р°
      xhr.addEventListener('load', () => {
        const uploadDuration = Date.now() - uploadStartTime
        console.log(`вњ… [${new Date().toISOString()}] Response РїРѕР»СѓС‡РµРЅ Р·Р° ${(uploadDuration / 1000).toFixed(2)} СЃРµРєСѓРЅРґ:`, {
          status: xhr.status,
          statusText: xhr.statusText,
          uploadDuration: `${(uploadDuration / 1000).toFixed(2)}s`,
          xhrReadyState: xhr.readyState,
          responseLength: xhr.responseText?.length || 0,
          responsePreview: xhr.responseText?.substring(0, 200) || '',
        })
        
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText) as UploadFileResponse
            console.log('вњ… Р¤Р°Р№Р» Р·Р°РіСЂСѓР¶РµРЅ:', data)
            if (request.onProgress) {
              request.onProgress(100) // РЈР±РµР¶РґР°РµРјСЃСЏ, С‡С‚Рѕ РїСЂРѕРіСЂРµСЃСЃ = 100%
            }
            resolve(data)
          } catch (e) {
            console.error('вќЊ РћС€РёР±РєР° РїР°СЂСЃРёРЅРіР° РѕС‚РІРµС‚Р°:', e)
            reject(new Error('РћС€РёР±РєР° РїР°СЂСЃРёРЅРіР° РѕС‚РІРµС‚Р° СЃРµСЂРІРµСЂР°'))
          }
        } else {
          let errorMessage = 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё С„Р°Р№Р»Р°'
          let errorDetails: any = {}
          try {
            const errorData = JSON.parse(xhr.responseText)
            errorMessage = errorData.detail || errorData.message || errorMessage
            errorDetails = errorData
          } catch (e) {
            errorMessage = `HTTP ${xhr.status}: ${xhr.statusText}`
            errorDetails = { parseError: e, rawResponse: xhr.responseText?.substring(0, 500) }
          }
          console.error(`вќЊ [${new Date().toISOString()}] Upload error response:`, {
            errorMessage,
            status: xhr.status,
            statusText: xhr.statusText,
            uploadDuration: `${(uploadDuration / 1000).toFixed(2)}s`,
            errorDetails,
            responseText: xhr.responseText?.substring(0, 500),
          })
          reject(new Error(errorMessage))
        }
      })
      
      // РћР±СЂР°Р±РѕС‚РєР° РѕС€РёР±РѕРє
      xhr.addEventListener('error', (event) => {
        const uploadDuration = Date.now() - uploadStartTime
        console.error(`вќЊ [${new Date().toISOString()}] XMLHttpRequest ERROR РїРѕСЃР»Рµ ${(uploadDuration / 1000).toFixed(2)} СЃРµРєСѓРЅРґ`, {
          event: event,
          uploadDuration: `${(uploadDuration / 1000).toFixed(2)}s`,
          xhrReadyState: xhr.readyState,
          xhrStatus: xhr.status,
          xhrStatusText: xhr.statusText,
          url: uploadUrl,
          fileSize: request.file.size,
          fileName: request.file.name,
          errorType: 'network_error',
        })
        reject(new Error(`РћС€РёР±РєР° СЃРµС‚Рё РїСЂРё Р·Р°РіСЂСѓР·РєРµ С„Р°Р№Р»Р°. Р—Р°РіСЂСѓР·РєР° РґР»РёР»Р°СЃСЊ ${(uploadDuration / 1000).toFixed(2)} СЃРµРєСѓРЅРґ`))
      })
      
      xhr.addEventListener('abort', () => {
        const uploadDuration = Date.now() - uploadStartTime
        console.error(`вќЊ [${new Date().toISOString()}] XMLHttpRequest ABORTED РїРѕСЃР»Рµ ${(uploadDuration / 1000).toFixed(2)} СЃРµРєСѓРЅРґ`, {
          uploadDuration: `${(uploadDuration / 1000).toFixed(2)}s`,
          xhrReadyState: xhr.readyState,
          xhrStatus: xhr.status,
          xhrStatusText: xhr.statusText,
          url: uploadUrl,
          fileSize: request.file.size,
          fileName: request.file.name,
        })
        reject(new Error(`Р—Р°РіСЂСѓР·РєР° Р±С‹Р»Р° РѕС‚РјРµРЅРµРЅР°. Р—Р°РіСЂСѓР·РєР° РґР»РёР»Р°СЃСЊ ${(uploadDuration / 1000).toFixed(2)} СЃРµРєСѓРЅРґ`))
      })
      
      // РћС‚СЃР»РµР¶РёРІР°РµРј РёР·РјРµРЅРµРЅРёСЏ readyState РґР»СЏ РґРёР°РіРЅРѕСЃС‚РёРєРё
      xhr.addEventListener('readystatechange', () => {
        console.log(`рџ”„ [${new Date().toISOString()}] XMLHttpRequest readyState РёР·РјРµРЅРёР»СЃСЏ:`, {
          readyState: xhr.readyState,
          readyStateText: ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE'][xhr.readyState],
          status: xhr.status,
          statusText: xhr.statusText,
          uploadDuration: `${((Date.now() - uploadStartTime) / 1000).toFixed(2)}s`,
        })
      })
      
      // РћС‚РєСЂС‹РІР°РµРј Р·Р°РїСЂРѕСЃ
      console.log(`рџљЂ [${new Date().toISOString()}] РћС‚РєСЂС‹РІР°РµРј XMLHttpRequest Р·Р°РїСЂРѕСЃ:`, {
        method: 'POST',
        url: uploadUrl,
        fileSize: request.file.size,
        fileName: request.file.name,
        timeout: `${(xhr.timeout / 1000).toFixed(0)}s`,
      })
      xhr.open('POST', uploadUrl)
      
      // РћС‚РїСЂР°РІР»СЏРµРј FormData
      console.log(`рџ“¤ [${new Date().toISOString()}] РћС‚РїСЂР°РІР»СЏРµРј FormData...`)
      const sendStartTime = Date.now()
      xhr.send(formData)
      console.log(`вњ… [${new Date().toISOString()}] xhr.send() РІС‹Р·РІР°РЅ, РѕР¶РёРґР°РµРј РѕС‚РІРµС‚...`)
      
      // РњРѕРЅРёС‚РѕСЂРёРЅРі: РїСЂРѕРІРµСЂСЏРµРј РєР°Р¶РґС‹Рµ 10 СЃРµРєСѓРЅРґ, РЅРµ РѕСЃС‚Р°РЅРѕРІРёР»Р°СЃСЊ Р»Рё Р·Р°РіСЂСѓР·РєР°
      const progressMonitor = setInterval(() => {
        const timeSinceLastProgress = Date.now() - lastProgressTime
        if (timeSinceLastProgress > 30000 && xhr.readyState < 4) {
          console.warn(`вљ пёЏ [${new Date().toISOString()}] РњРћРќРРўРћР РРќР“: Р—Р°РіСЂСѓР·РєР° РЅРµ РѕР±РЅРѕРІР»СЏР»Р°СЃСЊ ${(timeSinceLastProgress / 1000).toFixed(0)} СЃРµРєСѓРЅРґ!`, {
            xhrReadyState: xhr.readyState,
            xhrStatus: xhr.status,
            lastProgressTime: new Date(lastProgressTime).toISOString(),
            uploadDuration: `${((Date.now() - uploadStartTime) / 1000).toFixed(2)}s`,
          })
        }
      }, 10000) // РџСЂРѕРІРµСЂСЏРµРј РєР°Р¶РґС‹Рµ 10 СЃРµРєСѓРЅРґ
      
      // РћС‡РёС‰Р°РµРј РјРѕРЅРёС‚РѕСЂРёРЅРі РїСЂРё Р·Р°РІРµСЂС€РµРЅРёРё
      xhr.addEventListener('load', () => clearInterval(progressMonitor))
      xhr.addEventListener('error', () => clearInterval(progressMonitor))
      xhr.addEventListener('abort', () => clearInterval(progressMonitor))
      xhr.addEventListener('timeout', () => clearInterval(progressMonitor))
    })
  }
  
  // РСЃРїРѕР»СЊР·СѓРµРј fetch API - РѕРЅ Р»СѓС‡С€Рµ РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚ CORS Рё РґР°РµС‚ Р±РѕР»РµРµ РїРѕРЅСЏС‚РЅС‹Рµ РѕС€РёР±РєРё
  try {
    console.log('РќР°С‡РёРЅР°РµРј fetch Р·Р°РїСЂРѕСЃ...', {
      url: uploadUrl,
      method: 'POST',
      fileSize: request.file.size,
      fileName: request.file.name,
    })
    
    const fetchStartTime = Date.now()
    console.log('вЏ±пёЏ Fetch start time:', fetchStartTime)
    
    // Р—Р°РіСЂСѓР·РєР° С„Р°Р№Р»Р° РЅРµ С‚СЂРµР±СѓРµС‚ С‚Р°Р№РјР°СѓС‚Р° - РѕРЅР° РґРѕР»Р¶РЅР° Р·Р°РІРµСЂС€РёС‚СЊСЃСЏ Р±С‹СЃС‚СЂРѕ
    // РўР°Р№РјР°СѓС‚ РЅСѓР¶РµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ РґР»РёС‚РµР»СЊРЅС‹С… РѕРїРµСЂР°С†РёР№ РєРѕРЅРІРµСЂС‚Р°С†РёРё
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      // РќР• СѓСЃС‚Р°РЅР°РІР»РёРІР°РµРј Content-Type - Р±СЂР°СѓР·РµСЂ СЃР°Рј СѓСЃС‚Р°РЅРѕРІРёС‚ СЃ boundary
      // РќРµ СѓСЃС‚Р°РЅР°РІР»РёРІР°РµРј РґСЂСѓРіРёРµ Р·Р°РіРѕР»РѕРІРєРё - СЌС‚Рѕ РјРѕР¶РµС‚ РІС‹Р·РІР°С‚СЊ preflight
    })
    const fetchDuration = Date.now() - fetchStartTime
    console.log(`вњ… Response РїРѕР»СѓС‡РµРЅ Р·Р° ${fetchDuration}ms:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('вќЊ Upload error response:', errorText)
      let errorMessage = 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё С„Р°Р№Р»Р°'
      try {
        const errorData = JSON.parse(errorText)
        errorMessage = errorData.detail || errorData.message || errorMessage
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`
      }
      throw new Error(errorMessage)
    }
    
    const data = await response.json()
    console.log('вњ… Р¤Р°Р№Р» Р·Р°РіСЂСѓР¶РµРЅ:', data)
    return data
  } catch (error) {
    console.error('вќЊ РћС€РёР±РєР° РїСЂРё Р·Р°РіСЂСѓР·РєРµ С„Р°Р№Р»Р°:', error)
    
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
          'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРєР»СЋС‡РёС‚СЊСЃСЏ Рє СЃРµСЂРІРµСЂСѓ. РџСЂРѕРІРµСЂСЊС‚Рµ:\n' +
          '1. Р—Р°РїСѓС‰РµРЅ Р»Рё backend СЃРµСЂРІРµСЂ РЅР° http://localhost:8000\n' +
          '2. РќРµС‚ Р»Рё РїСЂРѕР±Р»РµРј СЃ CORS (РїСЂРѕРІРµСЂСЊС‚Рµ РєРѕРЅСЃРѕР»СЊ Р±СЂР°СѓР·РµСЂР° Рё Network tab)\n' +
          '3. РќРµ Р±Р»РѕРєРёСЂСѓРµС‚ Р»Рё Р°РЅС‚РёРІРёСЂСѓСЃ/Р±СЂР°РЅРґРјР°СѓСЌСЂ РїРѕРґРєР»СЋС‡РµРЅРёРµ\n' +
          '4. РџСЂРѕРІРµСЂСЊС‚Рµ Network tab - РґРѕР»Р¶РµРЅ РїРѕСЏРІРёС‚СЊСЃСЏ OPTIONS Р·Р°РїСЂРѕСЃ (preflight)'
        )
      }
      if (error.message.includes('aborted')) {
        throw new Error('Р—Р°РїСЂРѕСЃ Р±С‹Р» РѕС‚РјРµРЅРµРЅ (С‚Р°Р№РјР°СѓС‚). Р’РѕР·РјРѕР¶РЅРѕ, СЃРµСЂРІРµСЂ РЅРµ РѕС‚РІРµС‡Р°РµС‚.')
      }
    }
    
    throw error
  }
}

// РџРѕР»СѓС‡РёС‚СЊ СЃС‚Р°С‚СѓСЃ Р·Р°РіСЂСѓР·РєРё Рё РєРѕРЅРІРµСЂС‚Р°С†РёРё
export async function getUploadProgress(
  fileUploadId: string
): Promise<UploadProgress> {
  const response = await fetch(`${API_BASE_URL}/upload/${fileUploadId}/progress`)

  if (!response.ok) {
    throw new Error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃС‚Р°С‚СѓСЃР° Р·Р°РіСЂСѓР·РєРё')
  }

  return response.json()
}

// РџРѕР»СѓС‡РёС‚СЊ СЃРїРёСЃРѕРє Р·Р°РіСЂСѓР¶РµРЅРЅС‹С… С„Р°Р№Р»РѕРІ
export async function getFileUploads(
  projectId?: string,
  versionId?: string,
  signal?: AbortSignal
): Promise<FileUpload[]> {
  const params = new URLSearchParams()
  if (projectId) params.append('projectId', projectId)
  if (versionId) params.append('versionId', versionId)

  const endpoint = `/upload${params.toString() ? `?${params.toString()}` : ''}`
  
  console.log('рџ“Ў Р—Р°РїСЂРѕСЃ С„Р°Р№Р»РѕРІ:', endpoint)
  
  try {
    // РСЃРїРѕР»СЊР·СѓРµРј apiGet СЃ СѓРІРµР»РёС‡РµРЅРЅС‹Рј С‚Р°Р№РјР°СѓС‚РѕРј (120 СЃРµРєСѓРЅРґ) РґР»СЏ РјРµРґР»РµРЅРЅС‹С… Р·Р°РїСЂРѕСЃРѕРІ Рє СѓРґР°Р»РµРЅРЅРѕР№ Р‘Р”
    const data = await apiGet<any[]>(endpoint, 120000, signal)
    
    // Р•СЃР»Рё РґР°РЅРЅС‹Рµ РЅРµ РїРѕР»СѓС‡РµРЅС‹, РІРѕР·РІСЂР°С‰Р°РµРј РїСѓСЃС‚РѕР№ РјР°СЃСЃРёРІ
    if (!data || !Array.isArray(data)) {
      console.log('вљ пёЏ РџРѕР»СѓС‡РµРЅС‹ РЅРµРєРѕСЂСЂРµРєС‚РЅС‹Рµ РґР°РЅРЅС‹Рµ, РІРѕР·РІСЂР°С‰Р°РµРј РїСѓСЃС‚РѕР№ РјР°СЃСЃРёРІ')
      return []
    }
    
    console.log('вњ… РџРѕР»СѓС‡РµРЅС‹ С„Р°Р№Р»С‹:', data.length, 'С€С‚.')
  
    // РџСЂРµРѕР±СЂР°Р·СѓРµРј snake_case РІ camelCase РґР»СЏ frontend
    return data.map((file: any) => ({
      id: file.id,
      userId: file.user_id,
      projectId: file.project_id,
      versionId: file.version_id,
      originalFilename: file.original_filename,
      fileType: file.file_type, // РџСЂРµРѕР±СЂР°Р·СѓРµРј file_type РІ fileType
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
  } catch (error: any) {
    // РћР±СЂР°Р±Р°С‚С‹РІР°РµРј РѕС€РёР±РєРё РѕС‚РјРµРЅС‹ Р·Р°РїСЂРѕСЃР°
    if (error.name === 'AbortError' || signal?.aborted) {
      console.log('рџ“Ў Р—Р°РїСЂРѕСЃ С„Р°Р№Р»РѕРІ РѕС‚РјРµРЅРµРЅ')
      throw new Error('Р—Р°РїСЂРѕСЃ Р±С‹Р» РѕС‚РјРµРЅРµРЅ')
    }
    throw error
  }
}

// РџРѕР»СѓС‡РёС‚СЊ РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ С„Р°Р№Р»Рµ
export async function getFileUpload(fileUploadId: string): Promise<FileUpload> {
  const response = await fetch(`${API_BASE_URL}/upload/${fileUploadId}`)

  if (!response.ok) {
    throw new Error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РёРЅС„РѕСЂРјР°С†РёРё Рѕ С„Р°Р№Р»Рµ')
  }

  return response.json()
}

// РќР°С‡Р°С‚СЊ РєРѕРЅРІРµСЂС‚Р°С†РёСЋ С„Р°Р№Р»Р°
export async function startConversion(
  fileUploadId: string,
  conversionType: 'IFC_TO_CSV' | 'RVT_TO_CSV',
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
    const error = await response.json().catch(() => ({ message: 'РћС€РёР±РєР° Р·Р°РїСѓСЃРєР° РєРѕРЅРІРµСЂС‚Р°С†РёРё' }))
    throw new Error(error.message || 'РћС€РёР±РєР° Р·Р°РїСѓСЃРєР° РєРѕРЅРІРµСЂС‚Р°С†РёРё')
  }

  return response.json()
}

// РџРѕР»СѓС‡РёС‚СЊ СЃС‚Р°С‚СѓСЃ РєРѕРЅРІРµСЂС‚Р°С†РёРё
export async function getConversionJob(jobId: string): Promise<ConversionJob> {
  const response = await fetch(`${API_BASE_URL}/conversion/${jobId}`)

  if (!response.ok) {
    throw new Error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃС‚Р°С‚СѓСЃР° РєРѕРЅРІРµСЂС‚Р°С†РёРё')
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
  const url = `/conversion/project/${projectId}${
    params.toString() ? `?${params.toString()}` : ''
  }`

  // РСЃРїРѕР»СЊР·СѓРµРј apiGet РґР»СЏ РµРґРёРЅРѕРѕР±СЂР°Р·РЅРѕР№ РѕР±СЂР°Р±РѕС‚РєРё РѕС€РёР±РѕРє Рё С‚Р°Р№РјР°СѓС‚РѕРІ
  // РЈРІРµР»РёС‡РёРІР°РµРј С‚Р°Р№РјР°СѓС‚ РґРѕ 60 СЃРµРєСѓРЅРґ РґР»СЏ РЅР°РґРµР¶РЅРѕСЃС‚Рё РїСЂРё РІС‹СЃРѕРєРѕР№ РЅР°РіСЂСѓР·РєРµ
  try {
    return await apiGet<ProjectConversionStatus[]>(url, 60000)
  } catch (err: any) {
    // РРіРЅРѕСЂРёСЂСѓРµРј РѕС€РёР±РєРё Р°РІС‚РѕСЂРёР·Р°С†РёРё - СЂРµРґРёСЂРµРєС‚ СѓР¶Рµ РїСЂРѕРёР·РѕС€РµР»
    if (err.isAuthRedirect) {
      throw err
    }
    // РџСЂРё РѕС€РёР±РєР°С… СЃРѕРµРґРёРЅРµРЅРёСЏ РїСЂРѕР±СЂР°СЃС‹РІР°РµРј РѕС€РёР±РєСѓ РґР°Р»СЊС€Рµ, РЅРѕ СЃ РїРѕРЅСЏС‚РЅС‹Рј СЃРѕРѕР±С‰РµРЅРёРµРј
    const isConnectionError = err.message?.includes('Failed to fetch') || 
                              err.message?.includes('ERR_CONNECTION_RESET') ||
                              err.message?.includes('ERR_CONNECTION_REFUSED') ||
                              err.name === 'TypeError'
    if (isConnectionError) {
      // РџСЂРѕР±СЂР°СЃС‹РІР°РµРј РѕС€РёР±РєСѓ СЃ РїРѕРЅСЏС‚РЅС‹Рј СЃРѕРѕР±С‰РµРЅРёРµРј
      throw new Error('РћС€РёР±РєР° СЃРѕРµРґРёРЅРµРЅРёСЏ РїСЂРё РїРѕР»СѓС‡РµРЅРёРё СЃС‚Р°С‚СѓСЃРѕРІ РєРѕРЅРІРµСЂС‚Р°С†РёРё. Р’РѕР·РјРѕР¶РЅРѕ, СЃРµСЂРІРµСЂ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ.')
    }
    // Р”Р»СЏ РґСЂСѓРіРёС… РѕС€РёР±РѕРє РїСЂРѕР±СЂР°СЃС‹РІР°РµРј РєР°Рє РµСЃС‚СЊ
    throw err
  }
}

// РџРѕР»СѓС‡РёС‚СЊ СЃС‚Р°С‚СѓСЃ РѕС‡РµСЂРµРґРё РєРѕРЅРІРµСЂС‚Р°С†РёР№
export async function getQueueStatus(): Promise<QueueStatus> {
  // РЈРІРµР»РёС‡РёРІР°РµРј С‚Р°Р№РјР°СѓС‚ РґРѕ 60 СЃРµРєСѓРЅРґ РґР»СЏ РЅР°РґРµР¶РЅРѕСЃС‚Рё РїСЂРё РІС‹СЃРѕРєРѕР№ РЅР°РіСЂСѓР·РєРµ Рё РјРµРґР»РµРЅРЅРѕРј РїРѕРґРєР»СЋС‡РµРЅРёРё Рє Р‘Р”
  return apiGet<QueueStatus>('/conversion/queue/status', 60000)
}

export async function getConversionLogs(
  jobId: string,
  limit = 50
): Promise<ConversionLog[]> {
  const url = `${API_BASE_URL}/conversion/${jobId}/logs?limit=${limit}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ Р»РѕРіРѕРІ РєРѕРЅРІРµСЂС‚Р°С†РёРё')
  }

  return response.json()
}

// РћС‚РјРµРЅРёС‚СЊ РєРѕРЅРІРµСЂС‚Р°С†РёСЋ
export async function cancelConversion(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/conversion/${jobId}/cancel`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error('РћС€РёР±РєР° РѕС‚РјРµРЅС‹ РєРѕРЅРІРµСЂС‚Р°С†РёРё')
  }
}

// РЈРґР°Р»РёС‚СЊ С„Р°Р№Р»
export async function deleteFileUpload(fileUploadId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/upload/${fileUploadId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ С„Р°Р№Р»Р°')
  }
}

// РџРѕР»СѓС‡РёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё СЌРєСЃРїРѕСЂС‚Р°
export async function getExportSettings(
  userId?: string
): Promise<ExportSettings[]> {
  const params = userId ? `?userId=${userId}` : ''
  const response = await fetch(`${API_BASE_URL}/export-settings${params}`)

  if (!response.ok) {
    throw new Error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє СЌРєСЃРїРѕСЂС‚Р°')
  }

  return response.json()
}

// РЎРѕР·РґР°С‚СЊ РЅР°СЃС‚СЂРѕР№РєРё СЌРєСЃРїРѕСЂС‚Р°
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
    const error = await response.json().catch(() => ({ message: 'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РЅР°СЃС‚СЂРѕРµРє' }))
    throw new Error(error.message || 'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РЅР°СЃС‚СЂРѕРµРє')
  }

  return response.json()
}

// РћР±РЅРѕРІРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё СЌРєСЃРїРѕСЂС‚Р°
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
    const error = await response.json().catch(() => ({ message: 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє' }))
    throw new Error(error.message || 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє')
  }

  return response.json()
}

// РЈРґР°Р»РёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё СЌРєСЃРїРѕСЂС‚Р°
export async function deleteExportSettings(settingsId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/export-settings/${settingsId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє')
  }
}

// РџРѕР»СѓС‡РёС‚СЊ РјРµС‚Р°РґР°РЅРЅС‹Рµ С„Р°Р№Р»Р°
export async function getFileMetadata(fileUploadId: string): Promise<FileMetadata> {
  const response = await fetch(`${API_BASE_URL}/upload/${fileUploadId}/metadata`)

  if (!response.ok) {
    throw new Error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РјРµС‚Р°РґР°РЅРЅС‹С… С„Р°Р№Р»Р°')
  }

  return response.json()
}

// РЎРєР°С‡Р°С‚СЊ С„Р°Р№Р»
export async function downloadFile(
  fileUploadId: string,
  filename?: string
): Promise<Blob> {
  console.log('[downloadFile] РќР°С‡Р°Р»Рѕ Р·Р°РіСЂСѓР·РєРё С„Р°Р№Р»Р°:', { fileUploadId, filename })
  
  try {
    const response = await fetch(`${API_BASE_URL}/upload/${fileUploadId}/download`, {
      headers: {
        ...getAuthHeaders(),
      },
    })

    console.log('[downloadFile] РћС‚РІРµС‚ СЃРµСЂРІРµСЂР°:', { 
      status: response.status, 
      statusText: response.statusText,
      ok: response.ok 
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ РѕС€РёР±РєСѓ')
      console.error('[downloadFile] РћС€РёР±РєР° РѕС‚РІРµС‚Р°:', errorText)
      throw new Error(`РћС€РёР±РєР° СЃРєР°С‡РёРІР°РЅРёСЏ С„Р°Р№Р»Р°: ${response.status} ${response.statusText}`)
    }

    const blob = await response.blob()
    console.log('[downloadFile] Blob СЃРѕР·РґР°РЅ:', { 
      size: blob.size, 
      type: blob.type 
    })
    
    // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЃРєР°С‡Р°С‚СЊ С„Р°Р№Р»
    if (filename) {
      try {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.style.display = 'none'
        document.body.appendChild(a)
        console.log('[downloadFile] Р—Р°РїСѓСЃРє СЃРєР°С‡РёРІР°РЅРёСЏ:', filename)
        a.click()
        
        // РћС‡РёСЃС‚РєР° РїРѕСЃР»Рµ РЅРµР±РѕР»СЊС€РѕР№ Р·Р°РґРµСЂР¶РєРё
        setTimeout(() => {
          window.URL.revokeObjectURL(url)
          document.body.removeChild(a)
          console.log('[downloadFile] РЎРєР°С‡РёРІР°РЅРёРµ Р·Р°РІРµСЂС€РµРЅРѕ')
        }, 100)
      } catch (downloadError) {
        console.error('[downloadFile] РћС€РёР±РєР° РїСЂРё СЃРѕР·РґР°РЅРёРё СЃСЃС‹Р»РєРё РґР»СЏ СЃРєР°С‡РёРІР°РЅРёСЏ:', downloadError)
        throw new Error(`РќРµ СѓРґР°Р»РѕСЃСЊ РёРЅРёС†РёРёСЂРѕРІР°С‚СЊ СЃРєР°С‡РёРІР°РЅРёРµ: ${downloadError}`)
      }
    }

    return blob
  } catch (error) {
    console.error('[downloadFile] РћР±С‰Р°СЏ РѕС€РёР±РєР°:', error)
    throw error
  }
}

