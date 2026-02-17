/**
 * API клиент для работы с ИИ-классификацией элементов по СВОР
 */
import { apiGet, apiPost } from './client'

// ==================== Типы данных ====================

export interface SVORPosition {
  id: string
  svorCode: string
  svorName: string
  svorDescription?: string
  svorGroup?: string
  isActive: boolean
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
  svorGroup?: string
  isActive?: boolean
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
}

export interface ClassificationSettingsResponse {
  projectId: string
  versionId: string
  selectedSvorPositionIds: string[]
  updatedAt: string
}

// ==================== API функции ====================

/**
 * Получить список позиций СВОР
 */
export async function getSVORPositions(isActive?: boolean): Promise<SVORPosition[]> {
  const params = new URLSearchParams()
  if (isActive !== undefined) {
    params.append('is_active', isActive.toString())
  }

  const endpoint = `/ai/svor/positions${params.toString() ? `?${params.toString()}` : ''}`
  const data = await apiGet<{ positions: any[] }>(endpoint, 60000)

  return data.positions.map((p: any) => ({
    id: p.id,
    svorCode: p.svor_code,
    svorName: p.svor_name,
    svorDescription: p.svor_description,
    svorGroup: p.svor_group,
    isActive: p.is_active,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))
}

/**
 * Загрузить позиции СВОР
 */
export async function uploadSVORPositions(
  positions: SVORPositionCreate[]
): Promise<{ success: boolean; message: string; positions: Array<{ id: string; svorCode: string; svorName: string }> }> {
  console.log('[API] uploadSVORPositions: Начало загрузки', positions.length, 'позиций СВОР')
  
  // Преобразуем camelCase в snake_case для бэкенда
  const backendPositions = positions.map((p) => ({
    svor_code: p.svorCode,
    svor_name: p.svorName,
    svor_description: p.svorDescription,
    svor_group: p.svorGroup,
    is_active: p.isActive ?? true,
    filters: p.filters ? {
      allowed_categories: p.filters.allowedCategories,
      min_height: p.filters.minHeight,
      max_height: p.filters.maxHeight,
      min_area: p.filters.minArea,
      max_area: p.filters.maxArea,
      min_volume: p.filters.minVolume,
      max_volume: p.filters.maxVolume,
      min_length: p.filters.minLength,
      max_length: p.filters.maxLength,
      allowed_levels: p.filters.allowedLevels,
    } : undefined,
    embedding_text: p.embeddingText,
  }))
  
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
    }>('/ai/svor/upload', { positions: backendPositions }, 600000)
    
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
    updated_at: string
  }>('/ai/classification/settings', {
    project_id: request.projectId,
    version_id: request.versionId,
    selected_svor_position_ids: request.selectedSvorPositionIds,
  }, 30000)

  return {
    projectId: data.project_id,
    versionId: data.version_id,
    selectedSvorPositionIds: data.selected_svor_position_ids,
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
    updated_at: string
  }>(endpoint, 30000)

  return {
    projectId: data.project_id,
    versionId: data.version_id,
    selectedSvorPositionIds: data.selected_svor_position_ids,
    updatedAt: data.updated_at,
  }
}

