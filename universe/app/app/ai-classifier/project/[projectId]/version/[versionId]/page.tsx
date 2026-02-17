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
  type ClassificationResultsResponse,
} from '@/lib/api/ai-classification'
import { ClassificationTable } from '@/components/ai-classifier/ClassificationTable'
import { SVORSelector } from '@/components/ai-classifier/SVORSelector'

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
      setClassificationResults(results)
    } catch (err: any) {
      if (err.isAuthRedirect) {
        return
      }
      // Если результатов нет - это нормально, просто не показываем их
      console.log('Результаты классификации не найдены')
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
      
      await runClassification({
        projectId: params.projectId,
        versionId: params.versionId,
        svorPositionIds: selectedSvorIds,
      })
      
      // Ждем немного и загружаем результаты
      setTimeout(async () => {
        await loadClassificationResults()
        setIsClassifying(false)
      }, 2000)
    } catch (err: any) {
      console.error('Ошибка запуска классификации:', err)
      console.error('Детали ошибки:', JSON.stringify(err, null, 2))
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
          </div>
        </div>

        {/* Компонент выбора СВОР */}
        <div className="mb-6">
          <SVORSelector
            projectId={params.projectId}
            versionId={params.versionId}
            onSelectionChange={setSelectedSvorIds}
          />
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

        {classificationResults ? (
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
      </div>
    </div>
  )
}

