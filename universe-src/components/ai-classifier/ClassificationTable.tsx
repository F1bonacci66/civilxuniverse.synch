'use client'

import { useState, useMemo, useEffect } from 'react'
import { Search, Filter } from 'lucide-react'
import {
  type ClassificationResultsResponse,
  type ClassificationProposal,
  getSVORPositions,
  type SVORPosition,
  getClassificationSettings,
  saveClassificationSettings,
} from '@/lib/api/ai-classification'

interface ClassificationTableProps {
  results: ClassificationResultsResponse
  projectId: string
  versionId: string
  onActionComplete: () => void
}

export function ClassificationTable({
  results,
  projectId,
  versionId,
  onActionComplete,
}: ClassificationTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [minConfidence, setMinConfidence] = useState(0.3)
  const [svorPositionsMap, setSvorPositionsMap] = useState<Map<string, SVORPosition>>(new Map())

  // Загружаем позиции СВОР для получения описаний
  useEffect(() => {
    getSVORPositions().then((positions) => {
      const map = new Map<string, SVORPosition>()
      positions.forEach((pos) => {
        map.set(pos.id, pos)
      })
      setSvorPositionsMap(map)
    }).catch((err) => {
      console.error('Ошибка загрузки позиций СВОР:', err)
    })
  }, [])

  // Загружаем настройки классификации для получения similarityThreshold
  useEffect(() => {
    getClassificationSettings(projectId, versionId)
      .then((settings) => {
        if (settings.similarityThreshold !== undefined) {
          setMinConfidence(settings.similarityThreshold)
        }
      })
      .catch((err) => {
        console.error('Ошибка загрузки настроек классификации:', err)
      })
  }, [projectId, versionId])

  // Сохраняем similarityThreshold при изменении ползунка (с задержкой)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveClassificationSettings({
        projectId,
        versionId,
        selectedSvorPositionIds: [], // Не изменяем выбранные СВОР
        similarityThreshold: minConfidence,
      }).catch((err) => {
        console.error('Ошибка сохранения similarityThreshold:', err)
      })
    }, 500) // Задержка 500мс для избежания частых запросов

    return () => clearTimeout(timeoutId)
  }, [minConfidence, projectId, versionId])

  // Группируем результаты по позициям СВОР
  const svorPositionStats = useMemo(() => {
    const statsMap = new Map<string, {
      svorCode: string
      svorName: string
      svorDescription?: string
      elementCount: number
      elements: Array<{
        elementId: string
        category?: string
        proposal: ClassificationProposal
      }>
    }>()

    results.results.forEach((result) => {
      result.proposals.forEach((proposal) => {
        // Фильтр по минимальному confidence
        if (proposal.finalScore < minConfidence) {
          return
        }

        // Фильтр по поисковому запросу
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          const matchesCode = proposal.svorCode.toLowerCase().includes(query)
          const matchesName = proposal.svorName.toLowerCase().includes(query)
          const matchesElementId = result.elementId.toLowerCase().includes(query)
          const matchesCategory = result.category?.toLowerCase().includes(query) || false
          if (!matchesCode && !matchesName && !matchesElementId && !matchesCategory) {
            return
          }
        }

        const key = proposal.svorPositionId
        if (!statsMap.has(key)) {
          const svorPosition = svorPositionsMap.get(key)
          statsMap.set(key, {
            svorCode: proposal.svorCode,
            svorName: proposal.svorName,
            svorDescription: svorPosition?.svorDescription,
            elementCount: 0,
            elements: [],
          })
        }

        const stat = statsMap.get(key)!
        stat.elementCount++
        stat.elements.push({
          elementId: result.elementId,
          category: result.category,
          proposal,
        })
      })
    })

    return Array.from(statsMap.values()).sort((a, b) => b.elementCount - a.elementCount)
  }, [results.results, searchQuery, minConfidence, svorPositionsMap])



  const formatConfidence = (score: number) => {
    return `${(score * 100).toFixed(1)}%`
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-emerald-400'
    if (score >= 0.6) return 'text-amber-400'
    return 'text-red-400'
  }

  return (
    <div className="space-y-4">
      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[rgba(255,255,255,0.02)] rounded-lg border border-[rgba(255,255,255,0.1)] p-4">
          <div className="text-sm text-[#999] mb-1">Всего элементов</div>
          <div className="text-2xl font-bold text-white">{results.totalElements}</div>
        </div>
        <div className="bg-[rgba(255,255,255,0.02)] rounded-lg border border-[rgba(255,255,255,0.1)] p-4">
          <div className="text-sm text-[#999] mb-1">Классифицировано</div>
          <div className="text-2xl font-bold text-white">{results.classifiedElements}</div>
        </div>
        <div className="bg-[rgba(255,255,255,0.02)] rounded-lg border border-[rgba(255,255,255,0.1)] p-4">
          <div className="text-sm text-[#999] mb-1">Позиций СВОР</div>
          <div className="text-2xl font-bold text-white">{svorPositionStats.length}</div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex flex-col md:flex-row gap-4 flex-1">
          {/* Поиск */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#999]" />
            <input
              type="text"
              placeholder="Поиск по ID, категории, СВОР..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#999] focus:outline-none focus:border-primary-500"
            />
          </div>

          {/* Фильтр по confidence */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#999]" />
            <label className="text-sm text-[#999]">Min confidence:</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-32"
            />
            <span className="text-sm text-white w-12">{formatConfidence(minConfidence)}</span>
          </div>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-[rgba(255,255,255,0.02)] rounded-lg border border-[rgba(255,255,255,0.1)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[rgba(255,255,255,0.05)] border-b border-[rgba(255,255,255,0.1)]">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Классификатор</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Позиция классификатора</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Описание классификатора</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Количество найденных элементов</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
              {svorPositionStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#999]">
                    Нет результатов, соответствующих фильтрам
                  </td>
                </tr>
              ) : (
                svorPositionStats.map((stat) => (
                  <tr
                    key={stat.svorCode}
                    className="hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-primary-400 font-mono font-semibold">
                      {stat.svorCode}
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-semibold">
                      {stat.svorName}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#ccc]">
                      {stat.svorDescription || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-semibold">
                      {stat.elementCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

