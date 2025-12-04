'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import { Viewer3D, type Viewer3DRef } from '@/components/datalab/Viewer3D'
import { ViewerTree } from '@/components/datalab/ViewerTree'
import { ViewerProperties } from '@/components/datalab/ViewerProperties'
import { ViewerGroups } from '@/components/datalab/ViewerGroups'
import { ViewerControls } from '@/components/datalab/ViewerControls'
import { getFileUploads } from '@/lib/api/upload'
import { getViewerStatus, getMetadata, type ViewerMetadata } from '@/lib/api/viewer'
import type { FileUpload } from '@/lib/types/upload'
import { getProject, getProjectVersion } from '@/lib/api/projects'

export default function ModelViewerPage({
  params,
}: {
  params: { projectId: string; versionId: string; modelId: string }
}) {
  const [loading, setLoading] = useState(true)
  const [fileUpload, setFileUpload] = useState<FileUpload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string>(params.projectId)
  const [versionName, setVersionName] = useState<string>(params.versionId)
  const [hasXKT, setHasXKT] = useState(false)
  const [metadata, setMetadata] = useState<ViewerMetadata | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([])
  const [hiddenElementIds, setHiddenElementIds] = useState<string[]>([])
  const [isolatedElementIds, setIsolatedElementIds] = useState<string[] | null>(null)
  const [xrayMode, setXrayMode] = useState(false)
  const [displayMode, setDisplayMode] = useState<'wireframe' | 'solid' | 'shaded'>('shaded')
  const viewerRef = useRef<Viewer3DRef>(null)

  // Загружаем названия проекта и версии
  useEffect(() => {
    const loadNames = async () => {
      try {
        const [project, version] = await Promise.all([
          getProject(params.projectId),
          getProjectVersion(params.projectId, params.versionId),
        ])
        setProjectName(project.name)
        setVersionName(version.name)
      } catch (err) {
        console.error('Ошибка загрузки названий проекта/версии:', err)
        // Игнорируем ошибки авторизации - редирект уже произошел
        if ((err as any).isAuthRedirect) {
          return
        }
      }
    }
    loadNames()
  }, [params.projectId, params.versionId])

  // Загружаем файлы и находим RVT/IFC файл с XKT
  useEffect(() => {
    const loadFileUpload = async () => {
      try {
        setLoading(true)
        setError(null)

        // Получаем все файлы для версии
        const files = await getFileUploads(params.projectId, params.versionId)

        // Ищем RVT или IFC файл, который соответствует modelId
        // modelId может быть либо file_upload_id, либо model_name
        let rvtFile: FileUpload | undefined = files.find(
          (f) =>
            (f.fileType === 'RVT' || f.fileType === 'IFC') &&
            (f.id === params.modelId || f.modelId === params.modelId)
        )

        // Если не нашли по modelId, берем первый RVT/IFC файл
        if (!rvtFile) {
          rvtFile = files.find((f) => f.fileType === 'RVT' || f.fileType === 'IFC')
        }

        if (!rvtFile) {
          setError('RVT или IFC файл не найден для этой модели')
          setLoading(false)
          return
        }

        // Проверяем, есть ли XKT файл
        try {
          const status = await getViewerStatus(rvtFile.id)
          if (status.has_xkt) {
            setHasXKT(true)
            setFileUpload(rvtFile)

            // Загружаем metadata
            try {
              const metadataData = await getMetadata(rvtFile.id)
              setMetadata(metadataData)
            } catch (metadataErr: any) {
              console.warn('Не удалось загрузить metadata:', metadataErr)
              // Продолжаем без metadata
            }
          } else {
            setError(
              'XKT файл не найден. Модель еще не была сконвертирована в XKT. Пожалуйста, загрузите RVT файл с опцией "Конвертировать в IFC (3D визуализация)".'
            )
          }
        } catch (statusErr: any) {
          // Игнорируем ошибки авторизации - редирект уже произошел
          if (statusErr.isAuthRedirect) {
            return
          }
          console.error('Ошибка проверки статуса XKT:', statusErr)
          setError('Не удалось проверить статус конвертации XKT')
        }

        setLoading(false)
      } catch (err: any) {
        console.error('Ошибка загрузки файла:', err)
        // Игнорируем ошибки авторизации - редирект уже произошел
        if (err.isAuthRedirect) {
          return
        }
        setError(err.message || 'Ошибка загрузки файла')
        setLoading(false)
      }
    }

    loadFileUpload()
  }, [params.projectId, params.versionId, params.modelId])

  // Обработчики для панелей
  const handleElementSelect = useCallback((elementId: string) => {
    // Проверяем, что элемент существует в metadata
    if (metadata && metadata.elements && !metadata.elements[elementId]) {
      console.warn(`Элемент ${elementId} не найден в metadata`)
      return
    }
    
    setSelectedElementId(elementId)
    setSelectedElementIds([elementId])
    // Выделяем элемент в 3D
    if (viewerRef.current) {
      viewerRef.current.selectElements([elementId])
    }
  }, [metadata])

  const handleElementToggleVisibility = useCallback((elementId: string, visible: boolean) => {
    setHiddenElementIds((prev) => {
      if (visible) {
        return prev.filter((id) => id !== elementId)
      } else {
        return [...prev, elementId]
      }
    })
    // Обновляем видимость в 3D
    if (viewerRef.current) {
      if (visible) {
        viewerRef.current.showElements([elementId])
      } else {
        viewerRef.current.hideElements([elementId])
      }
    }
  }, [])

  const handleElementsSelect = useCallback((elementIds: string[]) => {
    setSelectedElementIds(elementIds)
    if (elementIds.length > 0) {
      setSelectedElementId(elementIds[0])
    } else {
      setSelectedElementId(null)
    }
    // Выделяем элементы в 3D
    if (viewerRef.current) {
      viewerRef.current.selectElements(elementIds)
    }
  }, [])

  const handleGroupApply = useCallback((elementIds: string[]) => {
    setSelectedElementIds(elementIds)
    if (elementIds.length > 0) {
      setSelectedElementId(elementIds[0])
    } else {
      setSelectedElementId(null)
    }
    // Выделяем элементы в 3D
    if (viewerRef.current) {
      viewerRef.current.selectElements(elementIds)
    }
  }, [])

  const handleHide = useCallback(() => {
    if (selectedElementIds.length === 0) return
    setHiddenElementIds((prev) => [...new Set([...prev, ...selectedElementIds])])
    if (viewerRef.current) {
      viewerRef.current.hideElements(selectedElementIds)
    }
  }, [selectedElementIds])

  const handleShow = useCallback(() => {
    if (hiddenElementIds.length === 0) return
    // Показываем все скрытые элементы
    const elementsToShow = [...hiddenElementIds]
    setHiddenElementIds([])
    if (viewerRef.current) {
      viewerRef.current.showElements(elementsToShow)
    }
  }, [hiddenElementIds])

  const handleIsolate = useCallback(() => {
    if (selectedElementIds.length === 0) return
    setIsolatedElementIds(selectedElementIds)
    if (viewerRef.current) {
      viewerRef.current.isolateElements(selectedElementIds)
    }
  }, [selectedElementIds])

  const handleReset = useCallback(() => {
    setHiddenElementIds([])
    setIsolatedElementIds(null)
    if (viewerRef.current) {
      viewerRef.current.isolateElements(null)
      viewerRef.current.showElements([])
    }
  }, [])

  const handleXrayToggle = useCallback(() => {
    setXrayMode((prev) => {
      const newValue = !prev
      if (viewerRef.current) {
        viewerRef.current.setXrayMode(newValue)
      }
      return newValue
    })
  }, [])

  const handleDisplayModeChange = useCallback((mode: 'wireframe' | 'solid' | 'shaded') => {
    setDisplayMode(mode)
    if (viewerRef.current) {
      viewerRef.current.setDisplayMode(mode)
    }
  }, [])

  const handleFitToView = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.fitToView()
    }
  }, [])

  return (
    <div className="p-8">
      <div className="max-w-[1920px] mx-auto">
        <div className="mb-6">
          <Link
            href={`/app/datalab/project/${params.projectId}/version/${params.versionId}/model/${params.modelId}/data`}
            className="text-primary-500 hover:text-primary-400 text-sm mb-4 inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к данным модели
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gradient mb-2">3D Viewer</h1>
              <p className="text-[#ccc] text-lg">
                Проект: {projectName} | Версия: {versionName}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-[rgba(0,0,0,0.6)] backdrop-blur-[10px] rounded-lg p-12 border border-[rgba(255,255,255,0.1)] text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary-500" />
            <p className="text-[#999]">Загрузка 3D модели...</p>
          </div>
        ) : error ? (
          <div className="bg-[rgba(0,0,0,0.6)] backdrop-blur-[10px] rounded-lg p-6 border border-red-500/50">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <AlertCircle className="w-5 h-5" />
              <p className="font-medium">Ошибка загрузки 3D модели</p>
            </div>
            <p className="text-[#999] text-sm">{error}</p>
            {!hasXKT && (
              <div className="mt-4">
                <Link
                  href="/app/datalab/upload"
                  className="text-primary-500 hover:text-primary-400 text-sm underline"
                >
                  Перейти на страницу загрузки файлов
                </Link>
              </div>
            )}
          </div>
        ) : fileUpload ? (
          <div className="flex gap-4 h-[calc(100vh-250px)] min-h-[600px]">
            {/* Левая панель: Дерево и Наборы */}
            <div className="w-80 flex flex-col gap-4 flex-shrink-0">
              {/* Дерево элементов */}
              <div className="flex-1 min-h-0">
                <ViewerTree
                  metadata={metadata}
                  selectedElementIds={selectedElementIds}
                  hiddenElementIds={hiddenElementIds}
                  onElementSelect={handleElementSelect}
                  onElementToggleVisibility={handleElementToggleVisibility}
                  onElementsSelect={handleElementsSelect}
                  className="h-full"
                />
              </div>

              {/* Наборы элементов */}
              <div className="h-80 flex-shrink-0">
                <ViewerGroups
                  fileUploadId={fileUpload.id}
                  selectedElementIds={selectedElementIds}
                  onGroupApply={handleGroupApply}
                  className="h-full"
                />
              </div>
            </div>

            {/* Центральная область: 3D Viewer */}
            <div className="flex-1 min-w-0 bg-[rgba(0,0,0,0.6)] backdrop-blur-[10px] rounded-lg border border-[rgba(255,255,255,0.1)] overflow-hidden relative">
              <Viewer3D
                ref={viewerRef}
                fileUploadId={fileUpload.id}
                selectedElementIds={selectedElementIds}
                hiddenElementIds={hiddenElementIds}
                isolatedElementIds={isolatedElementIds}
                xrayMode={xrayMode}
                displayMode={displayMode}
                onElementSelect={handleElementSelect}
                className="w-full h-full"
              />

              {/* Кнопки управления (в правом верхнем углу 3D viewer) */}
              <div className="absolute top-4 right-4 z-20">
                <ViewerControls
                  selectedElementIds={selectedElementIds}
                  hiddenElementIds={hiddenElementIds}
                  isolatedElementIds={isolatedElementIds}
                  xrayMode={xrayMode}
                  displayMode={displayMode}
                  onHide={handleHide}
                  onShow={handleShow}
                  onIsolate={handleIsolate}
                  onReset={handleReset}
                  onXrayToggle={handleXrayToggle}
                  onDisplayModeChange={handleDisplayModeChange}
                  onFitToView={handleFitToView}
                  className="w-64"
                />
              </div>
            </div>

            {/* Правая панель: Свойства */}
            <div className="w-80 flex-shrink-0">
              <ViewerProperties
                metadata={metadata}
                selectedElementId={selectedElementId}
                className="h-full"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

