'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Brain, Play, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getProject, getProjectVersion, type Project, type ProjectVersion } from '@/lib/api/projects'
import {
  runClassification,
  getClassificationResults,
  getSVORPositions,
  type ClassificationResultsResponse,
  type SVORPosition,
} from '@/lib/api/ai-classification'
import { ClassificationTable } from '@/components/ai-classifier/ClassificationTable'
import { SVORManager } from '@/components/ai-classifier/SVORManager'
import { FileText } from 'lucide-react'

export default function AIClassifierVersionPage({
  params,
}: {
  params: { projectId: string; versionId: string }
}) {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [version, setVersion] = useState<ProjectVersion | null>(null)
  const [loading, setLoading] = useState(true)
  const [classificationResults, setClassificationResults] = useState<ClassificationResultsResponse | null>(null)
  const [isClassifying, setIsClassifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSvorIds, setSelectedSvorIds] = useState<string[]>([])
  const [isSVORManagerOpen, setIsSVORManagerOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [params.projectId, params.versionId])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [projectData, versionData] = await Promise.all([
        getProject(params.projectId),
        getProjectVersion(params.projectId, params.versionId),
      ])
      
      setProject(projectData)
      setVersion(versionData)
      
      // Загружаем результаты классификации, если есть
      await loadClassificationResults()
    } catch (err: any) {
      console.error('Ошибка загрузки данных:', err)
      if (err.isAuthRedirect) {
        return
      }
      setError(err.message || 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  const loadClassificationResults = async () => {
    try {
      const results = await getClassificationResults(params.projectId, params.versionId)
      // Устанавливаем результаты, даже если они пустые (totalElements === 0)
      setClassificationResults(results)
    } catch (err: any) {
      if (err.isAuthRedirect) {
        return
      }
      // Если результатов нет - это нормально, просто не показываем их
      console.log('Результаты классификации не найдены:', err)
      // Не устанавливаем null, чтобы не скрывать существующие результаты
    }
  }

  const handleRunClassification = async () => {
    try {
      // Проверяем, что выбран хотя бы один СВОР
      if (selectedSvorIds.length === 0) {
        setError('Необходимо выбрать хотя бы один СВОР для запуска классификации')
        return
      }

      setIsClassifying(true)
      setError(null)
      
      // Получаем информацию о выбранных СВОР для логирования
      let selectedSvorInfo: SVORPosition[] = []
      try {
        const allSvorPositions = await getSVORPositions()
        selectedSvorInfo = allSvorPositions.filter(pos => selectedSvorIds.includes(pos.id))
      } catch (err) {
        console.warn('[Classification] Не удалось загрузить информацию о СВОР для логирования:', err)
      }
      
      // Подробное логирование запуска классификации
      console.group('🚀 [Classification] Запуск классификации')
      console.log('📋 Проект:', {
        id: params.projectId,
        name: project?.name || 'загрузка...',
      })
      console.log('📦 Версия:', {
        id: params.versionId,
        name: version?.name || 'загрузка...',
      })
      console.log('📊 Выбранные СВОР:', selectedSvorIds.length, 'позиций')
      selectedSvorInfo.forEach((svor, index) => {
        console.log(`  ${index + 1}. ${svor.svorCode} - ${svor.svorName}`)
      })
      console.groupEnd()
      
      const response = await runClassification({
        projectId: params.projectId,
        versionId: params.versionId,
        svorPositionIds: selectedSvorIds,
      })
      
      console.group('✅ [Classification] Классификация запущена')
      console.log('📊 Статус:', response.status)
      console.log('📈 Всего элементов:', response.totalElements)
      console.log('⚙️ Обработано элементов:', response.processedElements)
      console.log('💬 Сообщение:', response.message)
      console.log('🆔 Job ID:', response.jobId)
      console.groupEnd()
      
      // Polling для проверки результатов (классификация выполняется в фоне)
      let attempts = 0
      const maxAttempts = 30 // Максимум 30 попыток (5 минут)
      const pollInterval = 10000 // Проверяем каждые 10 секунд
      let lastProcessedCount = 0
      
      const pollResults = async () => {
        attempts++
        try {
          const results = await getClassificationResults(params.projectId, params.versionId)
          
          // Рассчитываем прогресс
          const processed = results.classifiedElements || 0
          const total = results.totalElements || response.totalElements || 1
          const progress = total > 0 ? Math.round((processed / total) * 100) : 0
          const processedDelta = processed - lastProcessedCount
          lastProcessedCount = processed
          
          // Логирование прогресса
          console.log(`🔄 [Classification] Проверка результатов (попытка ${attempts}/${maxAttempts}):`)
          console.log(`   📊 Обработано: ${processed}/${total} элементов (${progress}%)`)
          if (processedDelta > 0) {
            console.log(`   ⚡ За последние 10 сек: +${processedDelta} элементов`)
          }
          if (results.results.length > 0) {
            console.log(`   ✅ Найдено результатов: ${results.results.length} элементов`)
          }
          
          // Если есть результаты или достигли максимума попыток
          if (results.totalElements > 0 || attempts >= maxAttempts) {
            console.group('🎉 [Classification] Классификация завершена')
            console.log('📊 Всего элементов:', results.totalElements)
            console.log('✅ Классифицировано:', results.classifiedElements)
            console.log('📋 Результатов:', results.results.length)
            console.log('⏱️ Попыток проверки:', attempts)
            console.groupEnd()
            
            setClassificationResults(results)
            setIsClassifying(false)
            
            if (results.totalElements === 0 && attempts >= maxAttempts) {
              setError('Классификация выполняется слишком долго. Попробуйте обновить страницу позже.')
            }
          } else {
            // Продолжаем polling
            setTimeout(pollResults, pollInterval)
          }
        } catch (err: any) {
          if (err.isAuthRedirect) {
            setIsClassifying(false)
            return
          }
          
          console.warn(`⚠️ [Classification] Ошибка при проверке результатов (попытка ${attempts}):`, err)
          
          // Если это не ошибка "не найдено", продолжаем polling
          if (attempts < maxAttempts) {
            setTimeout(pollResults, pollInterval)
          } else {
            console.error('❌ [Classification] Превышено максимальное количество попыток')
            setIsClassifying(false)
            setError('Не удалось получить результаты классификации')
          }
        }
      }
      
      // Начинаем polling через 5 секунд после запуска
      console.log('⏳ [Classification] Начинаем проверку результатов через 5 секунд...')
      setTimeout(pollResults, 5000)
      
    } catch (err: any) {
      console.group('❌ [Classification] Ошибка запуска классификации')
      console.error('Ошибка:', err)
      console.error('Детали:', JSON.stringify(err, null, 2))
      console.groupEnd()
      
      if (err.isAuthRedirect) {
        return
      }
      // Обрабатываем разные форматы ошибок
      let errorMessage = 'Не удалось запустить классификацию'
      if (err.message) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err.detail) {
        if (Array.isArray(err.detail)) {
          errorMessage = err.detail.map((e: any) => {
            if (typeof e === 'string') return e
            if (e.msg) return `${e.loc?.join('.') || ''}: ${e.msg}`
            return JSON.stringify(e)
          }).join(', ')
        } else {
          errorMessage = String(err.detail)
        }
      } else {
        errorMessage = JSON.stringify(err)
      }
      setError(errorMessage)
      setIsClassifying(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            <span className="ml-3 text-[#ccc]">Загрузка...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error || !project || !version) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-red-400 text-center py-12">
            <p>{error || 'Проект или версия не найдены'}</p>
            <Button onClick={loadData} className="mt-4">
              Попробовать снова
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const projectRouteId = project.shortId?.toString() ?? project.id

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            href={`/app/ai-classifier/project/${projectRouteId}`}
            className="text-primary-500 hover:text-primary-400 text-sm mb-4 inline-block"
          >
            ← Назад к версиям проекта
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gradient mb-2">{version.name}</h1>
              <p className="text-[#ccc] text-lg mb-2">Проект: {project.name}</p>
              {version.description && (
                <p className="text-[#999] text-sm mb-2">{version.description}</p>
              )}
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm text-amber-300">
                  ⚠️ Автоклассификация. Требует подтверждения пользователя.
                </p>
              </div>
            </div>
            {/* Кнопка СВОР */}
            <button
              onClick={() => setIsSVORManagerOpen(true)}
              className="h-[66px] px-4 flex items-center gap-2 rounded-xl text-white bg-[rgba(20,184,166,0.3)] border-2 border-[rgba(20,184,166,0.6)] hover:bg-[rgba(20,184,166,0.4)] hover:border-[rgba(20,184,166,0.8)] transition-all duration-300 shadow-lg"
              style={{ minWidth: '166px' }}
            >
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-semibold whitespace-nowrap">СВОР</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Классификация элементов</h2>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleRunClassification}
              disabled={isClassifying || selectedSvorIds.length === 0}
              className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isClassifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Классификация...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Запустить классификацию
                </>
              )}
            </Button>
            {classificationResults && (
              <Button
                onClick={loadClassificationResults}
                variant="outline"
                className="border-[rgba(255,255,255,0.2)]"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Обновить
              </Button>
            )}
          </div>
        </div>

        {isClassifying ? (
          <div className="text-center py-12 bg-[rgba(255,255,255,0.02)] rounded-lg border border-[rgba(255,255,255,0.1)]">
            <Loader2 className="w-16 h-16 mx-auto text-primary-500 mb-4 animate-spin" />
            <h3 className="text-xl font-semibold text-white mb-2">Классификация выполняется...</h3>
            <p className="text-[#999] mb-6">
              Пожалуйста, подождите. Это может занять несколько минут.
            </p>
          </div>
        ) : classificationResults && classificationResults.totalElements > 0 ? (
          <ClassificationTable
            results={classificationResults}
            projectId={params.projectId}
            versionId={params.versionId}
            onActionComplete={loadClassificationResults}
          />
        ) : (
          <div className="text-center py-12 bg-[rgba(255,255,255,0.02)] rounded-lg border border-[rgba(255,255,255,0.1)]">
            <Brain className="w-16 h-16 mx-auto text-[#666] mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Классификация не выполнена</h3>
            <p className="text-[#999] mb-6">
              Нажмите "Запустить классификацию" для начала работы
            </p>
          </div>
        )}

        {/* Модальное окно управления СВОР */}
        <SVORManager
          projectId={params.projectId}
          versionId={params.versionId}
          isOpen={isSVORManagerOpen}
          onClose={() => setIsSVORManagerOpen(false)}
          onSelectionChange={setSelectedSvorIds}
        />
      </div>
    </div>
  )
}

