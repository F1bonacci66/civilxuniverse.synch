'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Folder, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getProject, getProjectVersions, type Project, type ProjectVersion } from '@/lib/api/projects'

export default function AIClassifierProjectPage({
  params,
}: {
  params: { projectId: string }
}) {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [versions, setVersions] = useState<ProjectVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [params.projectId])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [projectData, versionsData] = await Promise.all([
        getProject(params.projectId),
        getProjectVersions(params.projectId),
      ])
      
      setProject(projectData)
      setVersions(versionsData)
    } catch (err: any) {
      console.error('Ошибка загрузки данных проекта:', err)
      if (err.isAuthRedirect) {
        return
      }
      setError(err.message || 'Не удалось загрузить данные проекта')
    } finally {
      setLoading(false)
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

  if (error || !project) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-red-400 text-center py-12">
            <p>{error || 'Проект не найден'}</p>
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
            href="/app/ai-classifier"
            className="text-primary-500 hover:text-primary-400 text-sm mb-4 inline-block"
          >
            ← Назад к проектам
          </Link>
          <div>
            <h1 className="text-4xl font-bold text-gradient mb-2">{project.name}</h1>
            {project.description && (
              <p className="text-[#999] text-sm mb-2">{project.description}</p>
            )}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-4">Версии проекта</h2>
          <p className="text-[#999] text-sm mb-4">
            Выберите версию проекта для классификации элементов по СВОР
          </p>
        </div>

        {versions.length === 0 ? (
          <div className="text-center py-12">
            <Folder className="w-16 h-16 mx-auto text-[#666] mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Нет версий</h3>
            <p className="text-[#999] mb-6">Создайте версию проекта в DataLab</p>
            <Button onClick={() => router.push('/app/datalab')}>
              Перейти в DataLab
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {versions.map((version) => {
              const versionRouteId = version.shortId?.toString() ?? version.id
              return (
                <Link
                  key={version.id}
                  href={`/app/ai-classifier/project/${projectRouteId}/version/${versionRouteId}`}
                >
                  <Card className="cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors hover:border-[rgba(20,184,166,0.3)]">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Folder className="w-6 h-6 text-primary-500" />
                          <div>
                            <CardTitle className="text-lg">{version.name}</CardTitle>
                            {version.description && (
                              <CardDescription className="text-sm mt-1">
                                {version.description}
                              </CardDescription>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[#999]" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs text-[#999]">
                        Создано: {new Date(version.createdAt).toLocaleDateString('ru-RU')}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

