'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { 
  Search, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2,
  Loader2,
  Info
} from 'lucide-react'
import {
  getSVORPositions,
  getClassificationSettings,
  saveClassificationSettings,
  type SVORPosition,
  type ClassificationSettingsResponse,
} from '@/lib/api/ai-classification'

interface SVORSelectorProps {
  projectId: string
  versionId: string
  onSelectionChange?: (selectedIds: string[]) => void
}

export function SVORSelector({ 
  projectId, 
  versionId,
  onSelectionChange 
}: SVORSelectorProps) {
  const [svorPositions, setSvorPositions] = useState<SVORPosition[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Загружаем список СВОР и сохраненные настройки
  useEffect(() => {
    loadData()
  }, [projectId, versionId])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Загружаем список СВОР и настройки параллельно
      const [positions, settings] = await Promise.all([
        getSVORPositions(true), // Только активные
        getClassificationSettings(projectId, versionId).catch(() => null), // Игнорируем ошибку, если настроек нет
      ])

      setSvorPositions(positions)

      // Восстанавливаем выбранные СВОР из настроек
      if (settings && settings.selectedSvorPositionIds.length > 0) {
        setSelectedIds(new Set(settings.selectedSvorPositionIds))
        if (onSelectionChange) {
          onSelectionChange(settings.selectedSvorPositionIds)
        }
      }
    } catch (err: any) {
      console.error('Ошибка загрузки данных:', err)
      setError(err.message || 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
    
    const selectedArray = Array.from(newSelected)
    if (onSelectionChange) {
      onSelectionChange(selectedArray)
    }

    // Автосохранение с небольшой задержкой
    saveSettingsDebounced(selectedArray)
  }

  const handleSelectAll = () => {
    const filtered = getFilteredPositions()
    const allSelected = filtered.every(p => selectedIds.has(p.id))
    
    const newSelected = new Set(selectedIds)
    if (allSelected) {
      // Снимаем выделение со всех отфильтрованных
      filtered.forEach(p => newSelected.delete(p.id))
    } else {
      // Выделяем все отфильтрованные
      filtered.forEach(p => newSelected.add(p.id))
    }
    
    setSelectedIds(newSelected)
    const selectedArray = Array.from(newSelected)
    if (onSelectionChange) {
      onSelectionChange(selectedArray)
    }
    saveSettingsDebounced(selectedArray)
  }

  const handleToggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedIds(newExpanded)
  }

  // Debounce для автосохранения
  let saveTimeout: NodeJS.Timeout | null = null
  const saveSettingsDebounced = (selectedArray: string[]) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
    saveTimeout = setTimeout(() => {
      saveSettings(selectedArray)
    }, 500)
  }

  const saveSettings = async (selectedArray: string[]) => {
    try {
      setSaving(true)
      await saveClassificationSettings({
        projectId,
        versionId,
        selectedSvorPositionIds: selectedArray,
      })
    } catch (err: any) {
      console.error('Ошибка сохранения настроек:', err)
      // Не показываем ошибку пользователю, так как это автосохранение
    } finally {
      setSaving(false)
    }
  }

  const getFilteredPositions = () => {
    if (!searchQuery.trim()) {
      return svorPositions
    }
    
    const query = searchQuery.toLowerCase()
    return svorPositions.filter(
      p =>
        p.svorCode.toLowerCase().includes(query) ||
        p.svorName.toLowerCase().includes(query) ||
        (p.svorDescription && p.svorDescription.toLowerCase().includes(query))
    )
  }

  const filteredPositions = getFilteredPositions()
  const allFilteredSelected = filteredPositions.length > 0 && filteredPositions.every(p => selectedIds.has(p.id))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        <span className="ml-3 text-[#ccc]">Загрузка СВОР...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-400 text-center py-8">
        <p>{error}</p>
        <Button onClick={loadData} className="mt-4" variant="outline">
          Попробовать снова
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Заголовок и поиск */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Выбор СВОР для классификации</h3>
            <p className="text-sm text-[#999] mt-1">
              Выберите один или несколько СВОР. Выбор обязателен.
            </p>
          </div>
          {saving && (
            <div className="flex items-center text-sm text-[#999]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Сохранение...
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#666]" />
            <Input
              type="text"
              placeholder="Поиск по коду, названию или описанию..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#666]"
            />
          </div>
          {filteredPositions.length > 0 && (
            <Button
              onClick={handleSelectAll}
              variant="outline"
              className="border-[rgba(255,255,255,0.2)] text-white hover:bg-[rgba(255,255,255,0.1)]"
            >
              {allFilteredSelected ? 'Снять все' : 'Выбрать все'}
            </Button>
          )}
        </div>
      </div>

      {/* Счетчик выбранных */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary-500/10 border border-primary-500/30 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-primary-500" />
          <span className="text-sm text-primary-300">
            Выбрано: {selectedIds.size} из {svorPositions.length}
          </span>
        </div>
      )}

      {/* Список СВОР */}
      <div className="bg-[rgba(255,255,255,0.02)] rounded-lg border border-[rgba(255,255,255,0.1)] max-h-[500px] overflow-y-auto">
        {filteredPositions.length === 0 ? (
          <div className="text-center py-8 text-[#999]">
            {searchQuery ? 'Ничего не найдено' : 'Нет доступных позиций СВОР'}
          </div>
        ) : (
          <div className="divide-y divide-[rgba(255,255,255,0.1)]">
            {filteredPositions.map((position) => {
              const isSelected = selectedIds.has(position.id)
              const isExpanded = expandedIds.has(position.id)

              return (
                <div
                  key={position.id}
                  className={`p-4 hover:bg-[rgba(255,255,255,0.05)] transition-colors ${
                    isSelected ? 'bg-primary-500/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleSelection(position.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm font-semibold text-primary-400">
                              {position.svorCode}
                            </span>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 text-primary-500 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-white text-sm font-medium mb-1">
                            {position.svorName}
                          </p>
                          {position.svorDescription && (
                            <p className="text-[#999] text-xs line-clamp-2">
                              {position.svorDescription}
                            </p>
                          )}
                        </div>
                        {position.svorDescription && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleExpand(position.id)}
                            className="flex-shrink-0 h-8 w-8 p-0 text-[#666] hover:text-white"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                      {isExpanded && position.svorDescription && (
                        <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.1)]">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-[#666] mt-0.5 flex-shrink-0" />
                            <p className="text-[#ccc] text-sm">{position.svorDescription}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Предупреждение, если ничего не выбрано */}
      {selectedIds.size === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <Info className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-amber-300">
            Необходимо выбрать хотя бы один СВОР для запуска классификации
          </span>
        </div>
      )}
    </div>
  )
}

