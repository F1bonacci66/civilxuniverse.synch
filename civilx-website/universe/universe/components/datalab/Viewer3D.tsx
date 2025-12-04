'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { getMetadata, type ViewerMetadata } from '@/lib/api/viewer'
import { getAuthHeaders } from '@/lib/api/auth'
import { getApiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'

interface Viewer3DProps {
  fileUploadId: string
  className?: string
  onLoad?: () => void
  onError?: (error: Error) => void
  selectedElementIds?: string[]
  hiddenElementIds?: string[]
  isolatedElementIds?: string[] | null
  xrayMode?: boolean
  displayMode?: 'wireframe' | 'solid' | 'shaded'
  onElementSelect?: (elementId: string) => void
  onViewerReady?: (viewer: any) => void
}

export interface Viewer3DRef {
  viewer: any | null
  selectElements: (elementIds: string[]) => void
  hideElements: (elementIds: string[]) => void
  showElements: (elementIds: string[]) => void
  isolateElements: (elementIds: string[] | null) => void
  setXrayMode: (enabled: boolean) => void
  setDisplayMode: (mode: 'wireframe' | 'solid' | 'shaded') => void
  fitToView: () => void
}

export const Viewer3D = forwardRef<Viewer3DRef, Viewer3DProps>(
  (
    {
      fileUploadId,
      className,
      onLoad,
      onError,
      selectedElementIds = [],
      hiddenElementIds = [],
      isolatedElementIds = null,
      xrayMode = false,
      displayMode = 'shaded',
      onElementSelect,
      onViewerReady,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewerRef = useRef<any>(null)
    const modelRef = useRef<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [metadata, setMetadata] = useState<ViewerMetadata | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let isMounted = true

    const initViewer = async () => {
      try {
        setLoading(true)
        setError(null)

        // Динамически импортируем Xeokit SDK
        const { Viewer, XKTLoaderPlugin } = await import('@xeokit/xeokit-sdk')

        // Создаем контейнер для viewer
        const container = containerRef.current
        if (!container) return

        // Создаем canvas элемент внутри контейнера
        const canvasId = `viewer-canvas-${fileUploadId}`
        const canvas = document.createElement('canvas')
        canvas.id = canvasId
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        canvas.style.display = 'block'
        container.innerHTML = ''
        container.appendChild(canvas)

        // Инициализируем Xeokit Viewer с canvas
        const viewerInstance = new Viewer({
          canvasId: canvasId,
          transparent: true,
          edges: true,
          saoEnabled: true,
          pbrEnabled: false,
        })

        viewerRef.current = viewerInstance

        // Загружаем metadata
        try {
          const metadataData = await getMetadata(fileUploadId)
          if (isMounted) {
            setMetadata(metadataData)
          }
        } catch (err) {
          console.warn('Не удалось загрузить metadata:', err)
          // Продолжаем без metadata
        }

        // Загружаем XKT файл через fetch с заголовками авторизации
        // XKTLoaderPlugin не поддерживает передачу заголовков, поэтому используем прямой URL с токеном
        const { baseURL: API_BASE_URL } = getApiClient()
        const { getAuthToken } = await import('@/lib/api/auth')
        const token = getAuthToken()
        
        if (!token) {
          window.location.href = '/auth/login'
          throw new Error('Требуется авторизация')
        }
        
        const cleanBaseUrl = API_BASE_URL.replace(/\/$/, '')
        // Используем прямой URL с токеном в query параметре для XKTLoaderPlugin
        // Это временное решение, так как XKTLoaderPlugin не поддерживает заголовки авторизации
        const xktUrl = `${cleanBaseUrl}/viewer/${fileUploadId}/xkt?token=${encodeURIComponent(token)}`

        // Загружаем XKTLoaderPlugin
        const xktLoader = new XKTLoaderPlugin(viewerInstance)

        // Загружаем модель через прямой URL к API с токеном
        // XKTLoaderPlugin.load() возвращает промис, который резолвится когда модель загружена
        const model = await xktLoader.load({
          id: `model-${fileUploadId}`,
          src: xktUrl,
          edges: true,
        })
        
        modelRef.current = model

        // Настраиваем обработчик клика для выделения элементов
        // Используем замыкание для доступа к актуальному metadata
        const setupClickHandler = async () => {
          // Загружаем metadata для проверки элементов
          let metadataForCheck: ViewerMetadata | null = null
          try {
            metadataForCheck = await getMetadata(fileUploadId)
          } catch (err) {
            console.warn('Не удалось загрузить metadata для проверки элементов:', err)
          }

          viewerInstance.cameraControl.on('picked', (pickResult: any) => {
            if (pickResult && pickResult.entity && onElementSelect) {
              const entityId = pickResult.entity.id
              // entityId может быть в формате "model-{fileUploadId}#{elementId}"
              const elementId = entityId.split('#').pop() || entityId
              
              // Проверяем, существует ли элемент в metadata
              if (metadataForCheck && metadataForCheck.elements && metadataForCheck.elements[elementId]) {
                onElementSelect(elementId)
              } else {
                // Если metadata еще не загружен, все равно вызываем callback
                // Родительский компонент проверит наличие элемента
                onElementSelect(elementId)
              }
            }
          })
        }
        setupClickHandler()

        // Фокусируемся на модели
        viewerInstance.cameraFlight.flyTo({
          aabb: model.aabb,
          duration: 1.0,
        })

        // Уведомляем родительский компонент о готовности viewer
        if (onViewerReady) {
          onViewerReady(viewerInstance)
        }

        if (isMounted) {
          setLoading(false)
          onLoad?.()
        }
      } catch (err: any) {
        console.error('Ошибка инициализации 3D Viewer:', err)
        if (isMounted) {
          setError(err.message || 'Ошибка загрузки 3D модели')
          setLoading(false)
          onError?.(err)
        }
      }
    }

    initViewer()

    // Cleanup при размонтировании
    return () => {
      isMounted = false
      
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy()
        } catch (err) {
          console.error('Ошибка при уничтожении viewer:', err)
        }
        viewerRef.current = null
      }
      modelRef.current = null
    }
  }, [fileUploadId, onLoad, onError, onElementSelect, onViewerReady])

  // Утилиты для управления viewer (обернуты в useCallback для стабильности ссылок)
  const selectElements = useCallback((elementIds: string[]) => {
    if (!viewerRef.current || !modelRef.current) return

    const scene = viewerRef.current.scene
    const selected = scene.selectedObjects

    // Очищаем предыдущее выделение
    selected.forEach((obj: any) => {
      scene.setObjectsSelected([obj], false)
    })

    // Выделяем новые элементы
    elementIds.forEach((elementId) => {
      // Пытаемся найти entity по elementId
      const entityId = `${modelRef.current.id}#${elementId}`
      const entity = scene.objects[entityId]
      if (entity) {
        scene.setObjectsSelected([entity], true)
      }
    })
  }, [])

  const hideElements = useCallback((elementIds: string[]) => {
    if (!viewerRef.current || !modelRef.current) return

    const scene = viewerRef.current.scene
    elementIds.forEach((elementId) => {
      const entityId = `${modelRef.current.id}#${elementId}`
      const entity = scene.objects[entityId]
      if (entity) {
        scene.setObjectsVisible([entity], false)
      }
    })
  }, [])

  const showElements = useCallback((elementIds: string[]) => {
    if (!viewerRef.current || !modelRef.current) return

    const scene = viewerRef.current.scene
    elementIds.forEach((elementId) => {
      const entityId = `${modelRef.current.id}#${elementId}`
      const entity = scene.objects[entityId]
      if (entity) {
        scene.setObjectsVisible([entity], true)
      }
    })
  }, [])

  const isolateElements = useCallback((elementIds: string[] | null) => {
    if (!viewerRef.current || !modelRef.current) return

    const scene = viewerRef.current.scene
    const allObjects = Object.values(scene.objects) as any[]

    if (elementIds === null) {
      // Показываем все элементы
      scene.setObjectsVisible(allObjects, true)
    } else {
      // Скрываем все элементы
      scene.setObjectsVisible(allObjects, false)
      // Показываем только выбранные
      elementIds.forEach((elementId) => {
        const entityId = `${modelRef.current.id}#${elementId}`
        const entity = scene.objects[entityId]
        if (entity) {
          scene.setObjectsVisible([entity], true)
        }
      })
    }
  }, [])

  const setXrayMode = useCallback((enabled: boolean) => {
    if (!viewerRef.current) return
    // Xeokit не имеет встроенного X-ray режима, можно использовать прозрачность
    // Это упрощенная реализация
    viewerRef.current.saoEnabled = !enabled
  }, [])

  const setDisplayMode = useCallback((mode: 'wireframe' | 'solid' | 'shaded') => {
    if (!viewerRef.current || !modelRef.current) return

    const scene = viewerRef.current.scene
    const allObjects = Object.values(scene.objects) as any[]

    switch (mode) {
      case 'wireframe':
        scene.setObjectsEdges(allObjects, true)
        scene.setObjectsColorize(allObjects, [0.5, 0.5, 0.5])
        break
      case 'solid':
        scene.setObjectsEdges(allObjects, false)
        scene.setObjectsColorize(allObjects, null)
        break
      case 'shaded':
        scene.setObjectsEdges(allObjects, false)
        scene.setObjectsColorize(allObjects, null)
        break
    }
  }, [])

  const fitToView = useCallback(() => {
    if (!viewerRef.current || !modelRef.current) return

    viewerRef.current.cameraFlight.flyTo({
      aabb: modelRef.current.aabb,
      duration: 1.0,
    })
  }, [])

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    viewer: viewerRef.current,
    selectElements,
    hideElements,
    showElements,
    isolateElements,
    setXrayMode,
    setDisplayMode,
    fitToView,
  }))

  // Синхронизация выделения
  useEffect(() => {
    if (!viewerRef.current || !modelRef.current) return
    selectElements(selectedElementIds)
  }, [selectedElementIds, selectElements])

  // Синхронизация видимости
  useEffect(() => {
    if (!viewerRef.current || !modelRef.current) return
    // Если есть изоляция, не применяем скрытие
    if (isolatedElementIds !== null) return
    
    // Получаем все объекты модели
    const scene = viewerRef.current.scene
    const allObjects = Object.values(scene.objects) as any[]
    const modelId = modelRef.current.id

    // Показываем все элементы, которые не в списке скрытых
    allObjects.forEach((obj: any) => {
      const objId = obj.id
      if (objId.startsWith(`${modelId}#`)) {
        const elementId = objId.split('#').pop()
        const shouldBeHidden = hiddenElementIds.includes(elementId)
        scene.setObjectsVisible([obj], !shouldBeHidden)
      }
    })
  }, [hiddenElementIds, isolatedElementIds, hideElements])

  // Синхронизация изоляции
  useEffect(() => {
    if (!viewerRef.current || !modelRef.current) return
    isolateElements(isolatedElementIds)
  }, [isolatedElementIds, isolateElements])

  // Синхронизация X-ray режима
  useEffect(() => {
    if (!viewerRef.current) return
    setXrayMode(xrayMode)
  }, [xrayMode, setXrayMode])

  // Синхронизация режима отображения
  useEffect(() => {
    if (!viewerRef.current || !modelRef.current) return
    setDisplayMode(displayMode)
  }, [displayMode, setDisplayMode])

  return (
    <div className={cn('relative w-full h-full bg-[rgba(0,0,0,0.3)]', className)}>
      {/* Индикатор загрузки */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,0.5)] z-10">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            <p className="text-white text-sm">Загрузка 3D модели...</p>
          </div>
        </div>
      )}

      {/* Ошибка */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,0.5)] z-10">
          <div className="flex flex-col items-center gap-4 max-w-md mx-auto p-6 bg-red-500/10 border border-red-500/50 rounded-lg">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-red-400 text-center">{error}</p>
          </div>
        </div>
      )}

      {/* Контейнер для viewer */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ minHeight: '600px' }}
      />
    </div>
  )
})

Viewer3D.displayName = 'Viewer3D'

