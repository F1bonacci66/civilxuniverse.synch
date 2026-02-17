/**
 * API клиент для работы с ИИ-классификацией элементов по СВОР
 */
import { apiGet, apiPost, apiPut, apiDelete } from './client'

// ==================== Типы данных ====================

export interface SVORDocument {
  id: string
  name: string
  userId: string
  createdAt: string
  updatedAt: string
}

export interface SVORPosition {
  id: string
  svorDocumentId: string
  svorCode: string
  svorName: string
  svorDescription?: string
  createdAt: string
  updatedAt: string
}

export interface SVORFilter {
  allowedCategories?: string[]
  minHeight?: number
  maxHeight?: number
  minArea?: number
  maxArea?: number
  minVolume?: number
  maxVolume?: number
  minLength?: number
  maxLength?: number
  allowedLevels?: string[]
}

export interface SVORPositionCreate {
  svorCode: string
  svorName: string
  svorDescription?: string
  filters?: SVORFilter
  embeddingText?: string
}

export interface ClassificationProposal {
  svorPositionId: string
  svorCode: string
  svorName: string
  rank: number
  finalScore: number
  semanticSimilarity: number
  structuredBoost: number
}

export interface ElementClassificationResult {
  elementId: string
  category?: string
  proposals: ClassificationProposal[]
}

export interface ClassificationResultsResponse {
  projectId: string
  versionId: string
  totalElements: number
  classifiedElements: number
  results: ElementClassificationResult[]
}

export interface ClassificationRunRequest {
  projectId: string
  versionId: string
  fileUploadId?: string
  modelName?: string
  svorPositionIds?: string[]  // Список ID выбранных позиций СВОР
}

export interface ClassificationRunResponse {
  jobId: string
  status: string
  totalElements: number
  processedElements: number
  message: string
}

export interface ClassificationConfirmRequest {
  elementId: string
  projectId: string
  versionId: string
  svorPositionId: string
  actionType?: string
}

export interface ClassificationChangeRequest {
  elementId: string
  projectId: string
  versionId: string
  newSvorPositionId: string
  actionType?: string
}

export interface ClassificationRejectRequest {
  elementId: string
  projectId: string
  versionId: string
  actionType?: string
}

export interface ClassificationActionResponse {
  success: boolean
  message: string
  trainingEventId?: string
}

export interface ClassificationSettingsRequest {
  projectId: string
  versionId: string
  selectedSvorPositionIds: string[]
  similarityThreshold?: number  // Порог схожести эмбейдингов (0.0 - 1.0)
}

export interface ClassificationSettingsResponse {
  projectId: string
  versionId: string
  selectedSvorPositionIds: string[]
  similarityThreshold: number  // Порог схожести эмбейдингов (0.0 - 1.0)
  updatedAt: string
}

// ==================== API функции ====================

/**
 * Получить список документов СВОР текущего пользователя
 */
export async function getSVORDocuments(): Promise<SVORDocument[]> {
  const endpoint = '/ai/svor/documents'
  try {
    const data = await apiGet<{ documents: any[] }>(endpoint, 60000)

    console.log('[API] getSVORDocuments: получены данные:', data)
    console.log('[API] getSVORDocuments: количество элементов в ответе:', data.documents?.length || 0)
    
    if (!data.documents || !Array.isArray(data.documents)) {
      console.error('[API] getSVORDocuments: ОШИБКА - неверный формат ответа:', data)
      return []
    }
    
    const documents = data.documents
      .map((d: any) => {
        console.log('[API] getSVORDocuments: обработка элемента:', d)
        
        // Проверяем, что это документ, а не позиция
        if (d.svor_code || d.svor_name || d.svorCode || d.svorName) {
          console.error('[API] getSVORDocuments: ОШИБКА - получена позиция вместо документа:', d)
          return null
        }
        
        // Проверяем, что есть обязательные поля документа
        if (!d.id || !d.name) {
          console.error('[API] getSVORDocuments: ОШИБКА - отсутствуют обязательные поля:', d)
          return null
        }
        
        return {
          id: d.id,
          name: d.name,
          userId: d.user_id,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }
      })
      .filter((d): d is SVORDocument => d !== null)

    console.log('[API] getSVORDocuments: преобразовано документов:', documents.length)
    if (documents.length === 0 && data.documents.length > 0) {
      console.error('[API] getSVORDocuments: ВНИМАНИЕ - все элементы были отфильтрованы! Первый элемент:', data.documents[0])
    }
    return documents
  } catch (error: any) {
    console.error('[API] getSVORDocuments: ОШИБКА при запросе:', error)
    return []
  }
}

/**
 * Получить список позиций СВОР
 */
export async function getSVORPositions(svorDocumentId?: string): Promise<SVORPosition[]> {
  const params = new URLSearchParams()
  if (svorDocumentId) {
    params.append('svor_document_id', svorDocumentId)
  }

  const endpoint = `/ai/svor/positions${params.toString() ? `?${params.toString()}` : ''}`
  const data = await apiGet<{ positions: any[] }>(endpoint, 60000)

  return data.positions.map((p: any) => ({
    id: p.id,
    svorDocumentId: p.svor_document_id,
    svorCode: p.svor_code,
    svorName: p.svor_name,
    svorDescription: p.svor_description,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))
}

/**
 * Обновить документ СВОР (переименовать)
 */
export async function updateSVORDocument(
  documentId: string,
  name: string
): Promise<SVORDocument> {
  const endpoint = `/ai/svor/documents/${documentId}`
  const data = await apiPut<{
    id: string
    name: string
    user_id: string
    created_at: string
    updated_at: string
  }>(endpoint, { name }, 30000)

  return {
    id: data.id,
    name: data.name,
    userId: data.user_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

/**
 * Удалить документ СВОР
 */
export async function deleteSVORDocument(documentId: string): Promise<void> {
  const endpoint = `/ai/svor/documents/${documentId}`
  await apiDelete<{ message: string }>(endpoint, 30000)
}

/**
 * Загрузить позиции СВОР
 */
export async function uploadSVORPositions(
  positions: SVORPositionCreate[],
  documentName: string
): Promise<{ success: boolean; message: string; positions: Array<{ id: string; svorCode: string; svorName: string }> }> {
  console.log('[API] uploadSVORPositions: Начало загрузки', positions.length, 'позиций СВОР')
  console.log('[API] uploadSVORPositions: Название документа:', documentName)
  
  // Преобразуем camelCase в snake_case для бэкенда
  const backendPositions = positions.map((p) => {
    const position: any = {
      svor_code: p.svorCode,
      svor_name: p.svorName,
    }
    
    // Добавляем опциональные поля только если они есть
    if (p.svorDescription) {
      position.svor_description = p.svorDescription
    }
    
    if (p.filters) {
      const filter: any = {}
      if (p.filters.allowedCategories) filter.allowed_categories = p.filters.allowedCategories
      if (p.filters.minHeight !== undefined && p.filters.minHeight !== null) filter.min_height = p.filters.minHeight
      if (p.filters.maxHeight !== undefined && p.filters.maxHeight !== null) filter.max_height = p.filters.maxHeight
      if (p.filters.minArea !== undefined && p.filters.minArea !== null) filter.min_area = p.filters.minArea
      if (p.filters.maxArea !== undefined && p.filters.maxArea !== null) filter.max_area = p.filters.maxArea
      if (p.filters.minVolume !== undefined && p.filters.minVolume !== null) filter.min_volume = p.filters.minVolume
      if (p.filters.maxVolume !== undefined && p.filters.maxVolume !== null) filter.max_volume = p.filters.maxVolume
      if (p.filters.minLength !== undefined && p.filters.minLength !== null) filter.min_length = p.filters.minLength
      if (p.filters.maxLength !== undefined && p.filters.maxLength !== null) filter.max_length = p.filters.maxLength
      if (p.filters.allowedLevels) filter.allowed_levels = p.filters.allowedLevels
      
      // Добавляем filters только если есть хотя бы одно поле
      if (Object.keys(filter).length > 0) {
        position.filters = filter
      }
    }
    
    if (p.embeddingText) {
      position.embedding_text = p.embeddingText
    }
    
    return position
  })
  
  console.log('[API] uploadSVORPositions: Данные подготовлены для отправки')
  console.log('[API] uploadSVORPositions: Endpoint: /ai/svor/upload')
  console.log('[API] uploadSVORPositions: Таймаут: 600000ms (10 минут)')
  console.log('[API] uploadSVORPositions: Размер данных:', JSON.stringify(backendPositions).length, 'символов')
  
  const requestStartTime = Date.now()
  
  try {
    // Увеличиваем таймаут до 10 минут для загрузки СВОР (с учетом батч-обработки embedding)
    const data = await apiPost<{
      success: boolean
      message: string
      positions: Array<{ id: string; svor_code: string; svor_name: string }>
    }>('/ai/svor/upload', { document_name: documentName, positions: backendPositions }, 600000)
    
    const requestDuration = Date.now() - requestStartTime
    console.log('[API] uploadSVORPositions: ✅ Запрос выполнен успешно за', requestDuration, 'мс')
    console.log('[API] uploadSVORPositions: Ответ сервера:', {
      success: data.success,
      message: data.message,
      positionsCount: data.positions?.length || 0,
    })

    const result = {
      success: data.success,
      message: data.message,
      positions: data.positions.map((p) => ({
        id: p.id,
        svorCode: p.svor_code,
        svorName: p.svor_name,
      })),
    }
    
    console.log('[API] uploadSVORPositions: Результат преобразован, позиций:', result.positions.length)
    return result
    
  } catch (error: any) {
    const requestDuration = Date.now() - requestStartTime
    console.error('[API] uploadSVORPositions: ❌ Ошибка запроса')
    console.error('[API] uploadSVORPositions: Время до ошибки:', requestDuration, 'мс')
    console.error('[API] uploadSVORPositions: Тип ошибки:', error?.name || 'Unknown')
    console.error('[API] uploadSVORPositions: Сообщение:', error?.message || 'Неизвестная ошибка')
    console.error('[API] uploadSVORPositions: Статус ошибки:', error?.status || 'не указан')
    console.error('[API] uploadSVORPositions: Детали ошибки:', error?.details || 'нет деталей')
    
    // Логируем отправленные данные для диагностики
    console.error('[API] uploadSVORPositions: Отправленные данные:')
    console.error('[API] uploadSVORPositions:   document_name:', documentName)
    console.error('[API] uploadSVORPositions:   positions count:', backendPositions.length)
    if (backendPositions.length > 0) {
      console.error('[API] uploadSVORPositions:   Первая позиция:', JSON.stringify(backendPositions[0], null, 2))
    }
    
    // Пытаемся извлечь детали ошибки валидации
    if (error?.details) {
      try {
        const errorDetails = JSON.parse(error.details)
        console.error('[API] uploadSVORPositions: Детали ошибки валидации:', JSON.stringify(errorDetails, null, 2))
        if (errorDetails.detail && Array.isArray(errorDetails.detail)) {
          console.error('[API] uploadSVORPositions: Ошибки валидации:')
          errorDetails.detail.forEach((err: any, idx: number) => {
            console.error(`[API] uploadSVORPositions:   ${idx + 1}. Поле: ${err.loc?.join('.') || 'unknown'}, Тип: ${err.type || 'unknown'}, Сообщение: ${err.msg || 'нет сообщения'}`)
          })
        }
      } catch (e) {
        console.error('[API] uploadSVORPositions: Не удалось распарсить детали ошибки:', e)
      }
    }
    
    console.error('[API] uploadSVORPositions: Полная ошибка:', error)
    throw error
  }
}

/**
 * Запустить классификацию элементов
 */
export async function runClassification(
  request: ClassificationRunRequest
): Promise<ClassificationRunResponse> {
  // Преобразуем camelCase в snake_case для бэкенда
  const backendRequest: any = {
    project_id: request.projectId,
    version_id: request.versionId,
    file_upload_id: request.fileUploadId,
    model_name: request.modelName,
  }
  
  // Добавляем выбранные СВОР, если указаны
  if (request.svorPositionIds && request.svorPositionIds.length > 0) {
    backendRequest.svor_position_ids = request.svorPositionIds
  }
  
  // Логируем для отладки
  console.log('[AI Classification] Отправка запроса:', JSON.stringify(backendRequest))
  
  // Увеличиваем таймаут до 120 секунд, так как подсчет элементов может занять время
  const data = await apiPost<any>('/ai/classification/run', backendRequest, 120000)

  return {
    jobId: data.job_id,
    status: data.status,
    totalElements: data.total_elements,
    processedElements: data.processed_elements,
    message: data.message,
  }
}

/**
 * Получить результаты классификации
 */
export async function getClassificationResults(
  projectId: string,
  versionId: string,
  elementId?: string
): Promise<ClassificationResultsResponse> {
  const params = new URLSearchParams()
  params.append('project_id', projectId)
  params.append('version_id', versionId)
  if (elementId) {
    params.append('element_id', elementId)
  }

  const endpoint = `/ai/classification/results?${params.toString()}`
  const data = await apiGet<any>(endpoint, 120000)

  return {
    projectId: data.project_id,
    versionId: data.version_id,
    totalElements: data.total_elements,
    classifiedElements: data.classified_elements,
    results: data.results.map((r: any) => ({
      elementId: r.element_id,
      category: r.category,
      proposals: r.proposals.map((p: any) => ({
        svorPositionId: p.svor_position_id,
        svorCode: p.svor_code,
        svorName: p.svor_name,
        rank: p.rank,
        finalScore: p.final_score,
        semanticSimilarity: p.semantic_similarity,
        structuredBoost: p.structured_boost,
      })),
    })),
  }
}

/**
 * Подтвердить классификацию элемента
 */
export async function confirmClassification(
  request: ClassificationConfirmRequest
): Promise<ClassificationActionResponse> {
  const data = await apiPost<any>('/ai/classification/confirm', {
    element_id: request.elementId,
    project_id: request.projectId,
    version_id: request.versionId,
    svor_position_id: request.svorPositionId,
    action_type: request.actionType || 'confirm',
  }, 30000)

  return {
    success: data.success,
    message: data.message,
    trainingEventId: data.training_event_id,
  }
}

/**
 * Изменить классификацию элемента
 */
export async function changeClassification(
  request: ClassificationChangeRequest
): Promise<ClassificationActionResponse> {
  const data = await apiPost<any>('/ai/classification/change', {
    element_id: request.elementId,
    project_id: request.projectId,
    version_id: request.versionId,
    new_svor_position_id: request.newSvorPositionId,
    action_type: request.actionType || 'change',
  }, 30000)

  return {
    success: data.success,
    message: data.message,
    trainingEventId: data.training_event_id,
  }
}

/**
 * Отклонить классификацию элемента
 */
export async function rejectClassification(
  request: ClassificationRejectRequest
): Promise<ClassificationActionResponse> {
  const data = await apiPost<any>('/ai/classification/reject', {
    element_id: request.elementId,
    project_id: request.projectId,
    version_id: request.versionId,
    action_type: request.actionType || 'reject',
  }, 30000)

  return {
    success: data.success,
    message: data.message,
    trainingEventId: data.training_event_id,
  }
}

/**
 * Сохранить настройки классификации для версии проекта
 */
export async function saveClassificationSettings(
  request: ClassificationSettingsRequest
): Promise<ClassificationSettingsResponse> {
  const data = await apiPost<{
    project_id: string
    version_id: string
    selected_svor_position_ids: string[]
    similarity_threshold: number
    updated_at: string
  }>('/ai/classification/settings', {
    project_id: request.projectId,
    version_id: request.versionId,
    selected_svor_position_ids: request.selectedSvorPositionIds,
    similarity_threshold: request.similarityThreshold,
  }, 30000)

  return {
    projectId: data.project_id,
    versionId: data.version_id,
    selectedSvorPositionIds: data.selected_svor_position_ids,
    similarityThreshold: data.similarity_threshold,
    updatedAt: data.updated_at,
  }
}

/**
 * Получить настройки классификации для версии проекта
 */
export async function getClassificationSettings(
  projectId: string,
  versionId: string
): Promise<ClassificationSettingsResponse> {
  const params = new URLSearchParams()
  params.append('project_id', projectId)
  params.append('version_id', versionId)

  const endpoint = `/ai/classification/settings?${params.toString()}`
  const data = await apiGet<{
    project_id: string
    version_id: string
    selected_svor_position_ids: string[]
    similarity_threshold: number
    updated_at: string
  }>(endpoint, 30000)

  return {
    projectId: data.project_id,
    versionId: data.version_id,
    selectedSvorPositionIds: data.selected_svor_position_ids,
    similarityThreshold: data.similarity_threshold,
    updatedAt: data.updated_at,
  }
}

