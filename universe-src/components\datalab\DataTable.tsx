'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, ChevronUp, ChevronDown, Loader2, Filter, X, ChevronRight } from 'lucide-react'
import { getCSVData, type CSVDataRow, type CSVDataFilters } from '@/lib/api/data'
import { Button } from '@/components/ui/button'

interface DataTableProps {
  fileUploadId?: string
  projectId?: string
  versionId?: string
  userId?: string
}

type SortField = 'row_number' | 'model_name' | 'element_id' | 'category' | 'parameter_name' | 'parameter_value'
type SortOrder = 'asc' | 'desc'
type ColumnFilterField = 'model_name' | 'element_id' | 'category' | 'parameter_name' | 'parameter_value'

export function DataTable({ fileUploadId, projectId, versionId, userId }: DataTableProps) {
  const [data, setData] = useState<CSVDataRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [limit] = useState(100)
  const [hasMore, setHasMore] = useState(false)

  // Фильтры и поиск
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [parameterFilter, setParameterFilter] = useState<string>('')
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  const [availableParameters, setAvailableParameters] = useState<string[]>([])

  // Фильтры по столбцам (множественный выбор)
  const [columnFilters, setColumnFilters] = useState<Record<ColumnFilterField, Set<string>>>({
    model_name: new Set(),
    element_id: new Set(),
    category: new Set(),
    parameter_name: new Set(),
    parameter_value: new Set(),
  })

  // Открытые выпадающие списки фильтров
  const [openFilterDropdown, setOpenFilterDropdown] = useState<ColumnFilterField | null>(null)
  const [filterSearchQueries, setFilterSearchQueries] = useState<Record<ColumnFilterField, string>>({
    model_name: '',
    element_id: '',
    category: '',
    parameter_name: '',
    parameter_value: '',
  })

  // Сортировка
  const [sortBy, setSortBy] = useState<SortField>('row_number')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // Refs для закрытия выпадающих списков при клике вне
  const filterDropdownRefs = useRef<Record<ColumnFilterField, HTMLDivElement | null>>({
    model_name: null,
    element_id: null,
    category: null,
    parameter_name: null,
    parameter_value: null,
  })

  // Логирование пропсов при изменении
  useEffect(() => {
    console.log('📋 DataTable props:', { fileUploadId, projectId, versionId, userId })
  }, [fileUploadId, projectId, versionId, userId])

  // Загрузка данных
  const loadData = async (resetOffset = false) => {
    try {
      setLoading(true)
      setError(null)

      const currentOffset = resetOffset ? 0 : offset

      const filters: CSVDataFilters = {
        fileUploadId,
        projectId,
        versionId,
        userId,
        search: search || undefined,
        category: categoryFilter || undefined,
        parameterName: parameterFilter || undefined,
        sortBy,
        sortOrder,
        limit,
        offset: currentOffset,
      }

      console.log('📊 Загрузка CSV данных с фильтрами:', filters)

      const response = await getCSVData(filters)

      console.log('✅ Получены данные:', {
        total: response.total,
        received: response.data.length,
        hasMore: response.hasMore,
      })

      if (resetOffset) {
        setData(response.data)
        setOffset(0)
      } else {
        setData((prev) => [...prev, ...response.data])
      }

      setTotal(response.total)
      setHasMore(response.hasMore)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ошибка загрузки данных'
      console.error('❌ Error loading data:', err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Загрузка при изменении фильтров
  useEffect(() => {
    setOffset(0)
    loadData(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, parameterFilter, sortBy, sortOrder, fileUploadId, projectId, versionId])

  // Загрузка уникальных значений для фильтров
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const filters: CSVDataFilters = {
          fileUploadId,
          projectId,
          versionId,
          userId,
          limit: 1000, // Получаем больше для подсчета уникальных значений
        }

        const response = await getCSVData(filters)
        
        // Извлекаем уникальные категории и параметры
        const categories = new Set<string>()
        const parameters = new Set<string>()

        response.data.forEach((row) => {
          if (row.category) categories.add(row.category)
          if (row.parameterName) parameters.add(row.parameterName)
        })

        setAvailableCategories(Array.from(categories).sort())
        setAvailableParameters(Array.from(parameters).sort())
      } catch (err) {
        console.error('Error loading filters:', err)
      }
    }

    if (fileUploadId || projectId || versionId) {
      loadFilters()
    }
  }, [fileUploadId, projectId, versionId])

  // Закрытие выпадающих списков при клике вне
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openFilterDropdown) {
        const ref = filterDropdownRefs.current[openFilterDropdown]
        if (ref && !ref.contains(event.target as Node)) {
          setOpenFilterDropdown(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openFilterDropdown])

  // Получение уникальных значений для столбца из загруженных данных
  const getUniqueValuesForColumn = (field: ColumnFilterField): string[] => {
    const values = new Set<string>()
    let hasEmpty = false
    data.forEach((row) => {
      let value: string | null = null
      switch (field) {
        case 'model_name':
          value = row.modelName
          break
        case 'element_id':
          value = row.elementId
          break
        case 'category':
          value = row.category
          break
        case 'parameter_name':
          value = row.parameterName
          break
        case 'parameter_value':
          value = row.parameterValue
          break
      }
      if (value !== null && value !== undefined && value !== '') {
        values.add(value)
      } else {
        hasEmpty = true
      }
    })
    const result = Array.from(values).sort()
    if (hasEmpty) {
      result.unshift('(пусто)')
    }
    return result
  }

  // Применение фильтров к данным
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      // Фильтр по модели
      if (columnFilters.model_name.size > 0) {
        const value = row.modelName || null
        const filterValue = value === null || value === undefined || value === '' ? '(пусто)' : value
        if (!columnFilters.model_name.has(filterValue)) return false
      }

      // Фильтр по ID элемента
      if (columnFilters.element_id.size > 0) {
        const value = row.elementId || null
        const filterValue = value === null || value === undefined || value === '' ? '(пусто)' : value
        if (!columnFilters.element_id.has(filterValue)) return false
      }

      // Фильтр по категории
      if (columnFilters.category.size > 0) {
        const value = row.category || null
        const filterValue = value === null || value === undefined || value === '' ? '(пусто)' : value
        if (!columnFilters.category.has(filterValue)) return false
      }

      // Фильтр по параметру
      if (columnFilters.parameter_name.size > 0) {
        const value = row.parameterName || null
        const filterValue = value === null || value === undefined || value === '' ? '(пусто)' : value
        if (!columnFilters.parameter_name.has(filterValue)) return false
      }

      // Фильтр по значению
      if (columnFilters.parameter_value.size > 0) {
        const value = row.parameterValue || null
        const filterValue = value === null || value === undefined || value === '' ? '(пусто)' : value
        if (!columnFilters.parameter_value.has(filterValue)) return false
      }

      return true
    })
  }, [data, columnFilters])

  // Переключение фильтра столбца
  const toggleColumnFilter = (field: ColumnFilterField, value: string) => {
    setColumnFilters((prev) => {
      const newFilters = { ...prev }
      const currentSet = new Set(newFilters[field])
      if (currentSet.has(value)) {
        currentSet.delete(value)
      } else {
        currentSet.add(value)
      }
      newFilters[field] = currentSet
      return newFilters
    })
  }

  // Сброс фильтра столбца
  const clearColumnFilter = (field: ColumnFilterField) => {
    setColumnFilters((prev) => {
      const newFilters = { ...prev }
      newFilters[field] = new Set()
      return newFilters
    })
    setFilterSearchQueries((prev) => ({
      ...prev,
      [field]: '',
    }))
  }

  // Обработка сортировки
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  // Сброс фильтров
  const resetFilters = () => {
    setSearch('')
    setCategoryFilter('')
    setParameterFilter('')
    setColumnFilters({
      model_name: new Set(),
      element_id: new Set(),
      category: new Set(),
      parameter_name: new Set(),
      parameter_value: new Set(),
    })
    setFilterSearchQueries({
      model_name: '',
      element_id: '',
      category: '',
      parameter_name: '',
      parameter_value: '',
    })
  }

  // Загрузка следующей страницы
  const loadMore = async () => {
    if (!loading && hasMore) {
      const newOffset = offset + limit
      setOffset(newOffset)
      
      try {
        setLoading(true)
        const filters: CSVDataFilters = {
          fileUploadId,
          projectId,
          versionId,
          userId,
          search: search || undefined,
          category: categoryFilter || undefined,
          parameterName: parameterFilter || undefined,
          sortBy,
          sortOrder,
          limit,
          offset: newOffset,
        }

        const response = await getCSVData(filters)
        setData((prev) => [...prev, ...response.data])
        setHasMore(response.hasMore)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки данных')
      } finally {
        setLoading(false)
      }
    }
  }

  // Отображение пустых значений
  const formatValue = (value: string | null | undefined) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-[#666] italic">—</span>
    }
    return value
  }

  // Индикатор сортировки
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return null
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 inline ml-1" />
    )
  }

  // Компонент выпадающего списка фильтра
  const FilterDropdown = ({ field, label }: { field: ColumnFilterField; label: string }) => {
    const isOpen = openFilterDropdown === field
    const selectedValues = columnFilters[field]
    const allValues = getUniqueValuesForColumn(field)
    const searchQuery = filterSearchQueries[field]

    // Фильтрация значений по поисковому запросу
    const filteredValues = allValues.filter((value) =>
      value.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Сортировка: выбранные вверху
    const sortedValues = [...filteredValues].sort((a, b) => {
      const aSelected = selectedValues.has(a)
      const bSelected = selectedValues.has(b)
      if (aSelected && !bSelected) return -1
      if (!aSelected && bSelected) return 1
      return a.localeCompare(b, 'ru')
    })

    const hasActiveFilter = selectedValues.size > 0

    return (
      <div className="relative" ref={(el) => (filterDropdownRefs.current[field] = el)}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpenFilterDropdown(isOpen ? null : field)
          }}
          className="inline-flex items-center gap-1 hover:text-white transition-colors"
          title="Фильтр"
        >
          <ChevronRight
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
          {hasActiveFilter && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary-500 rounded-full"></span>
          )}
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-[rgba(0,0,0,0.95)] border border-[rgba(255,255,255,0.2)] rounded-lg shadow-xl">
            <div className="p-2 border-b border-[rgba(255,255,255,0.1)]">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#666]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) =>
                    setFilterSearchQueries((prev) => ({
                      ...prev,
                      [field]: e.target.value,
                    }))
                  }
                  placeholder="Поиск..."
                  className="w-full pl-8 pr-2 py-1.5 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded text-white text-sm placeholder-[#666] focus:outline-none focus:border-primary-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {sortedValues.length === 0 ? (
                <div className="p-3 text-sm text-[#999] text-center">
                  {searchQuery ? 'Ничего не найдено' : 'Нет данных'}
                </div>
              ) : (
                <div className="p-1">
                  {sortedValues.map((value) => {
                    const isSelected = selectedValues.has(value)
                    return (
                      <label
                        key={value}
                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-[rgba(255,255,255,0.05)] rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleColumnFilter(field, value)}
                          className="w-4 h-4 rounded border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.05)] text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-sm text-[#ccc] flex-1 truncate">{value}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {hasActiveFilter && (
              <div className="p-2 border-t border-[rgba(255,255,255,0.1)]">
                <button
                  onClick={() => clearColumnFilter(field)}
                  className="w-full px-2 py-1.5 text-sm text-primary-400 hover:text-primary-300 hover:bg-[rgba(255,255,255,0.05)] rounded transition-colors"
                >
                  Сбросить фильтр ({selectedValues.size})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const hasActiveFilters =
    search ||
    categoryFilter ||
    parameterFilter ||
    columnFilters.model_name.size > 0 ||
    columnFilters.element_id.size > 0 ||
    columnFilters.category.size > 0 ||
    columnFilters.parameter_name.size > 0 ||
    columnFilters.parameter_value.size > 0

  return (
    <div className="space-y-4">
      {/* Панель фильтров и поиска */}
      <div className="bg-[rgba(0,0,0,0.4)] backdrop-blur-[10px] rounded-lg p-4 border border-[rgba(255,255,255,0.1)]">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Поиск */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-[#ccc] mb-2">Поиск</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#666]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по всем полям..."
                className="w-full pl-10 pr-4 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#666] focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Фильтр по категории */}
          <div className="min-w-[150px]">
            <label className="block text-sm text-[#ccc] mb-2">Категория</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:outline-none focus:border-primary-500 [&>option]:bg-white [&>option]:text-black"
            >
              <option value="">Все категории</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Фильтр по параметру */}
          <div className="min-w-[150px]">
            <label className="block text-sm text-[#ccc] mb-2">Параметр</label>
            <select
              value={parameterFilter}
              onChange={(e) => setParameterFilter(e.target.value)}
              className="w-full px-4 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:outline-none focus:border-primary-500 [&>option]:bg-white [&>option]:text-black"
            >
              <option value="">Все параметры</option>
              {availableParameters.map((param) => (
                <option key={param} value={param}>
                  {param}
                </option>
              ))}
            </select>
          </div>

          {/* Кнопка сброса фильтров */}
          {hasActiveFilters && (
            <Button
              onClick={resetFilters}
              className="border-[rgba(255,255,255,0.2)] text-[#ccc] hover:bg-[rgba(255,255,255,0.1)] bg-transparent"
            >
              <X className="w-4 h-4 mr-2" />
              Сбросить
            </Button>
          )}
        </div>

        {/* Статистика */}
        <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.1)]">
          <div className="flex gap-6 text-sm text-[#999]">
            <span>Всего записей: <span className="text-white font-semibold">{total.toLocaleString()}</span></span>
            <span>Отображено: <span className="text-white font-semibold">{filteredData.length.toLocaleString()}</span></span>
            {hasActiveFilters && (
              <span className="text-primary-400">
                <Filter className="w-3 h-3 inline mr-1" />
                Фильтры активны
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-[rgba(0,0,0,0.6)] backdrop-blur-[10px] rounded-lg border border-[rgba(255,255,255,0.1)] overflow-hidden">
        {loading && data.length === 0 ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary-500" />
            <p className="text-[#999]">Загрузка данных...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-red-400 mb-2">Ошибка загрузки данных</p>
            <p className="text-[#999] text-sm">{error}</p>
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[#999]">Данные не найдены</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[rgba(255,255,255,0.05)] border-b border-[rgba(255,255,255,0.1)]">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-[#ccc] cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                      onClick={() => handleSort('row_number')}
                    >
                      <div className="flex items-center gap-2">
                        №
                        <SortIcon field="row_number" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-[#ccc] cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors relative"
                    >
                      <div className="flex items-center gap-2">
                        <span onClick={() => handleSort('model_name')} className="flex-1">
                          Модель
                          <SortIcon field="model_name" />
                        </span>
                        <FilterDropdown field="model_name" label="Модель" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-[#ccc] cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors relative"
                    >
                      <div className="flex items-center gap-2">
                        <span onClick={() => handleSort('element_id')} className="flex-1">
                          ID элемента
                          <SortIcon field="element_id" />
                        </span>
                        <FilterDropdown field="element_id" label="ID элемента" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-[#ccc] cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors relative"
                    >
                      <div className="flex items-center gap-2">
                        <span onClick={() => handleSort('category')} className="flex-1">
                          Категория
                          <SortIcon field="category" />
                        </span>
                        <FilterDropdown field="category" label="Категория" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-[#ccc] cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors relative"
                    >
                      <div className="flex items-center gap-2">
                        <span onClick={() => handleSort('parameter_name')} className="flex-1">
                          Параметр
                          <SortIcon field="parameter_name" />
                        </span>
                        <FilterDropdown field="parameter_name" label="Параметр" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-[#ccc] cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors relative"
                    >
                      <div className="flex items-center gap-2">
                        <span onClick={() => handleSort('parameter_value')} className="flex-1">
                          Значение
                          <SortIcon field="parameter_value" />
                        </span>
                        <FilterDropdown field="parameter_value" label="Значение" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
                  {filteredData.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-[#ccc]">{row.rowNumber}</td>
                      <td className="px-4 py-3 text-sm text-white">{formatValue(row.modelName)}</td>
                      <td className="px-4 py-3 text-sm text-white font-mono">{formatValue(row.elementId)}</td>
                      <td className="px-4 py-3 text-sm text-white">{formatValue(row.category)}</td>
                      <td className="px-4 py-3 text-sm text-white">{formatValue(row.parameterName)}</td>
                      <td className="px-4 py-3 text-sm text-white max-w-md truncate" title={row.parameterValue || ''}>
                        {formatValue(row.parameterValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Пагинация */}
            {hasMore && (
              <div className="p-4 border-t border-[rgba(255,255,255,0.1)] text-center">
                <Button
                  onClick={loadMore}
                  disabled={loading}
                  className="border-[rgba(255,255,255,0.2)] text-[#ccc] hover:bg-[rgba(255,255,255,0.1)]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Загрузка...
                    </>
                  ) : (
                    'Загрузить еще'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

