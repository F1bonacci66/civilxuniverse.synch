'use client'

import { useMemo } from 'react'
import { Info, FileText } from 'lucide-react'
import type { ViewerMetadata } from '@/lib/api/viewer'
import { cn } from '@/lib/utils'

interface ViewerPropertiesProps {
  metadata: ViewerMetadata | null
  selectedElementId: string | null
  className?: string
}

export function ViewerProperties({
  metadata,
  selectedElementId,
  className,
}: ViewerPropertiesProps) {
  // Получаем данные выбранного элемента
  const selectedElement = useMemo(() => {
    if (!metadata || !selectedElementId || !metadata.elements) {
      return null
    }

    const element = metadata.elements[selectedElementId]
    if (!element) return null

    return {
      id: selectedElementId,
      category: element.category,
      family: element.family,
      type: element.type,
      properties: element.properties || {},
    }
  }, [metadata, selectedElementId])

  // Группировка свойств по категориям (если есть префиксы или группы)
  const groupedProperties = useMemo(() => {
    if (!selectedElement) return []

    const properties = selectedElement.properties
    const groups: Record<string, Array<{ key: string; value: any }>> = {
      Основные: [],
      Дополнительные: [],
    }

    Object.entries(properties).forEach(([key, value]) => {
      // Определяем группу по префиксу или ключу
      let group = 'Дополнительные'
      
      // Основные свойства (категория, семейство, тип уже отображаются отдельно)
      const mainKeys = ['Name', 'Type', 'Category', 'Family', 'ElementId', 'GlobalId']
      if (mainKeys.some(mk => key.toLowerCase().includes(mk.toLowerCase()))) {
        group = 'Основные'
      }

      if (!groups[group]) {
        groups[group] = []
      }

      groups[group].push({ key, value })
    })

    return Object.entries(groups).filter(([_, props]) => props.length > 0)
  }, [selectedElement])

  if (!selectedElement) {
    return (
      <div
        className={cn(
          'bg-[rgba(31,41,55,0.6)] backdrop-blur-[10px] rounded-lg border border-[rgba(255,255,255,0.1)] flex flex-col h-full',
          className
        )}
      >
        <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.1)]">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <Info className="w-4 h-4" />
            Свойства элемента
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-[#999]" />
            <p className="text-[#999] text-sm">
              Выберите элемент в дереве или в 3D модели для просмотра свойств
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-[rgba(31,41,55,0.6)] backdrop-blur-[10px] rounded-lg border border-[rgba(255,255,255,0.1)] flex flex-col h-full',
        className
      )}
    >
      {/* Заголовок */}
      <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.1)]">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
          <Info className="w-4 h-4" />
          Свойства элемента
        </h3>
      </div>

      {/* Контент */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Основная информация */}
          <div>
            <h4 className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-3">
              Основная информация
            </h4>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <span className="text-sm text-[#999] min-w-[100px]">ID:</span>
                <span className="text-sm text-white font-mono break-all">
                  {selectedElement.id}
                </span>
              </div>
              {selectedElement.category && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-[#999] min-w-[100px]">Категория:</span>
                  <span className="text-sm text-white">{selectedElement.category}</span>
                </div>
              )}
              {selectedElement.family && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-[#999] min-w-[100px]">Семейство:</span>
                  <span className="text-sm text-white">{selectedElement.family}</span>
                </div>
              )}
              {selectedElement.type && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-[#999] min-w-[100px]">Тип:</span>
                  <span className="text-sm text-white">{selectedElement.type}</span>
                </div>
              )}
            </div>
          </div>

          {/* Свойства по группам */}
          {groupedProperties.map(([groupName, properties]) => (
            <div key={groupName}>
              <h4 className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-3">
                {groupName}
              </h4>
              <div className="space-y-2">
                {properties.map(({ key, value }) => (
                  <div key={key} className="flex items-start gap-3">
                    <span className="text-sm text-[#999] min-w-[120px] break-words">
                      {key}:
                    </span>
                    <span className="text-sm text-white flex-1 break-words">
                      {value === null || value === undefined
                        ? '(пусто)'
                        : typeof value === 'object'
                        ? JSON.stringify(value, null, 2)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Если нет свойств */}
          {groupedProperties.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[#999] text-sm">Нет дополнительных свойств</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

