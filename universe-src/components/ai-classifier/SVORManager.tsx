'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { X, Search, Upload, CheckCircle2, Loader2, ChevronDown, ChevronUp, MoreVertical, Edit2, Trash2 } from 'lucide-react'
import { 
  getSVORDocuments,
  getSVORPositions, 
  getClassificationSettings,
  saveClassificationSettings,
  updateSVORDocument,
  deleteSVORDocument,
  type SVORDocument,
  type SVORPosition 
} from '@/lib/api/ai-classification'
import { SVORUpload } from './SVORUpload'
import { useToast } from '@/components/ui/toast'

interface SVORManagerProps {
  projectId: string
  versionId: string
  isOpen: boolean
  onClose: () => void
  onSelectionChange?: (selectedIds: string[]) => void
}

export function SVORManager({ 
  projectId, 
  versionId, 
  isOpen, 
  onClose,
  onSelectionChange 
}: SVORManagerProps) {
  const [documents, setDocuments] = useState<SVORDocument[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [positions, setPositions] = useState<SVORPosition[]>([])
  const [selectedPositionIds, setSelectedPositionIds] = useState<Set<string>>(new Set())
  const [searchQueryLeft, setSearchQueryLeft] = useState('')
  const [searchQueryRight, setSearchQueryRight] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingPositions, setLoadingPositions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  
  // Состояния для меню и редактирования
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const { showToast } = useToast()

  // Загружаем данные при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen, projectId, versionId])

  const loadData = async () => {
    try {
      setLoading(true)
      
      console.log('[SVORManager] Начало загрузки данных...')
      
      const [documentsData, settings] = await Promise.all([
        getSVORDocuments(), // Список документов СВОР пользователя
        getClassificationSettings(projectId, versionId).catch(() => null),
      ])

      console.log('[SVORManager] Загружены документы:', documentsData)
      console.log('[SVORManager] Тип данных:', Array.isArray(documentsData) ? 'массив' : typeof documentsData)
      console.log('[SVORManager] Количество элементов:', documentsData.length)
      
      if (documentsData.length > 0) {
        console.log('[SVORManager] Первый элемент:', documentsData[0])
        console.log('[SVORManager] Ключи первого элемента:', Object.keys(documentsData[0]))
        console.log('[SVORManager] Первый элемент имеет svorCode?', 'svorCode' in documentsData[0] || 'svor_code' in documentsData[0])
        console.log('[SVORManager] Первый элемент имеет name?', 'name' in documentsData[0])
      } else {
        console.warn('[SVORManager] ВНИМАНИЕ: Документы не загружены или пустой массив!')
      }
      
      // Убеждаемся, что это действительно документы, а не позиции
      const validDocuments = documentsData.filter((doc: any) => {
        // Документ должен иметь name, но НЕ должен иметь svorCode или svorName
        const hasPositionFields = doc.svorCode || doc.svorName || doc.svor_code || doc.svor_name
        const hasDocumentFields = doc.name && doc.id && !hasPositionFields
        
        if (hasPositionFields) {
          console.error('[SVORManager] ❌ Обнаружен элемент с полями позиции:', {
            svorCode: doc.svorCode || doc.svor_code,
            svorName: doc.svorName || doc.svor_name,
            весь_элемент: doc
          })
        }
        
        if (!hasDocumentFields) {
          console.error('[SVORManager] ❌ Элемент не является документом (нет обязательных полей):', doc)
        }
        
        return hasDocumentFields
      })
      
      if (validDocuments.length !== documentsData.length) {
        console.error('[SVORManager] ❌ ОШИБКА: Некоторые элементы не являются документами!', {
          всего: documentsData.length,
          валидных: validDocuments.length,
          отфильтровано: documentsData.length - validDocuments.length
        })
      }

      console.log('[SVORManager] ✅ Установлено документов в state:', validDocuments.length)
      setDocuments(validDocuments)

      // Восстанавливаем выбранные позиции из настроек
      if (settings && settings.selectedSvorPositionIds.length > 0) {
        setSelectedPositionIds(new Set(settings.selectedSvorPositionIds))
        if (onSelectionChange) {
          onSelectionChange(settings.selectedSvorPositionIds)
        }
      }

      // Если есть документы, выбираем первый по умолчанию
      if (documentsData.length > 0 && !selectedDocumentId) {
        setSelectedDocumentId(documentsData[0].id)
        loadPositions(documentsData[0].id)
      }
    } catch (err: any) {
      console.error('Ошибка загрузки данных:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadPositions = async (documentId: string) => {
    try {
      setLoadingPositions(true)
      const positionsData = await getSVORPositions(documentId)
      console.log('[SVORManager] Загружены позиции для документа', documentId, ':', positionsData.length, 'позиций')
      setPositions(positionsData)
    } catch (err: any) {
      console.error('Ошибка загрузки позиций:', err)
      setPositions([])
    } finally {
      setLoadingPositions(false)
    }
  }

  const handleDocumentSelect = (documentId: string) => {
    setSelectedDocumentId(documentId)
    loadPositions(documentId)
    // Очищаем выбранные позиции при смене документа
    setSelectedPositionIds(new Set())
    if (onSelectionChange) {
      onSelectionChange([])
    }
  }

  // Фильтруем документы по поисковому запросу для левой панели
  const filteredDocuments = useMemo(() => {
    if (!searchQueryLeft.trim()) {
      return documents
    }
    
    const query = searchQueryLeft.toLowerCase()
    return documents.filter(doc => 
      doc.name.toLowerCase().includes(query)
    )
  }, [documents, searchQueryLeft])

  // Фильтруем позиции выбранного документа для правой панели
  const filteredRightPositions = useMemo(() => {
    if (!searchQueryRight.trim()) {
      return positions
    }
    
    const query = searchQueryRight.toLowerCase()
    return positions.filter(
      p =>
        p.svorCode.toLowerCase().includes(query) ||
        p.svorName.toLowerCase().includes(query) ||
        (p.svorDescription && p.svorDescription.toLowerCase().includes(query))
    )
  }, [positions, searchQueryRight])


  const handleToggleSelection = (positionId: string) => {
    const newSelected = new Set(selectedPositionIds)
    if (newSelected.has(positionId)) {
      newSelected.delete(positionId)
    } else {
      newSelected.add(positionId)
    }
    setSelectedPositionIds(newSelected)
    
    const selectedArray = Array.from(newSelected)
    if (onSelectionChange) {
      onSelectionChange(selectedArray)
    }
    
    // Сохраняем настройки
    saveSettings(selectedArray)
  }


  const handleSelectAll = () => {
    const allSelected = positions.every(p => selectedPositionIds.has(p.id))
    const newSelected = new Set(selectedPositionIds)
    
    if (allSelected) {
      positions.forEach(p => newSelected.delete(p.id))
    } else {
      positions.forEach(p => newSelected.add(p.id))
    }
    
    setSelectedPositionIds(newSelected)
    const selectedArray = Array.from(newSelected)
    if (onSelectionChange) {
      onSelectionChange(selectedArray)
    }
    saveSettings(selectedArray)
  }

  const handleDeselectAll = () => {
    setSelectedPositionIds(new Set())
    if (onSelectionChange) {
      onSelectionChange([])
    }
    saveSettings([])
  }

  const saveSettings = async (selectedArray: string[]) => {
    try {
      setSaving(true)
      // Получаем текущие настройки, чтобы сохранить similarityThreshold
      const currentSettings = await getClassificationSettings(projectId, versionId).catch(() => null)
      await saveClassificationSettings({
        projectId,
        versionId,
        selectedSvorPositionIds: selectedArray,
        similarityThreshold: currentSettings?.similarityThreshold,
      })
    } catch (err: any) {
      console.error('Ошибка сохранения настроек:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleUploadComplete = () => {
    setShowUpload(false)
    loadData() // Перезагружаем список документов
  }

  // Обработка открытия меню
  const handleMenuClick = (e: React.MouseEvent, documentId: string) => {
    e.stopPropagation()
    const button = e.currentTarget
    const rect = button.getBoundingClientRect()
    const isMenuOpen = openMenuId === `svor-${documentId}`
    
    if (isMenuOpen) {
      setOpenMenuId(null)
      setMenuPosition(null)
    } else {
      setOpenMenuId(`svor-${documentId}`)
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      })
    }
  }

  // Обработка переименования
  const handleRenameDocument = (document: SVORDocument) => {
    setEditingDocumentId(document.id)
    setEditingName(document.name)
    setOpenMenuId(null)
    setMenuPosition(null)
  }

  // Сохранение переименования
  const handleSaveRename = async () => {
    if (!editingDocumentId || !editingName.trim()) {
      setEditingDocumentId(null)
      setEditingName('')
      return
    }

    try {
      setIsUpdating(true)
      await updateSVORDocument(editingDocumentId, editingName.trim())
      showToast('СВОР успешно переименован', 'success')
      await loadData() // Перезагружаем список
      setEditingDocumentId(null)
      setEditingName('')
    } catch (err: any) {
      console.error('Ошибка переименования:', err)
      showToast(err.message || 'Не удалось переименовать', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  // Отмена переименования
  const handleCancelRename = () => {
    setEditingDocumentId(null)
    setEditingName('')
  }

  // Обработка удаления
  const handleDeleteDocument = (document: SVORDocument) => {
    setShowDeleteModal({ id: document.id, name: document.name })
    setOpenMenuId(null)
    setMenuPosition(null)
  }

  // Подтверждение удаления
  const handleConfirmDelete = async () => {
    if (!showDeleteModal) return

    try {
      setIsDeleting(true)
      await deleteSVORDocument(showDeleteModal.id)
      showToast('СВОР успешно удален', 'success')
      
      // Если удален выбранный документ, сбрасываем выбор
      if (selectedDocumentId === showDeleteModal.id) {
        setSelectedDocumentId(null)
        setPositions([])
        setSelectedPositionIds(new Set())
        if (onSelectionChange) {
          onSelectionChange([])
        }
      }
      
      await loadData() // Перезагружаем список
      setShowDeleteModal(null)
    } catch (err: any) {
      console.error('Ошибка удаления:', err)
      showToast(err.message || 'Не удалось удалить', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  // Закрытие меню при клике вне его
  useEffect(() => {
    if (!openMenuId) return
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest(`[data-menu-id]`) && !target.closest('[data-menu-dropdown]')) {
        setOpenMenuId(null)
        setMenuPosition(null)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[1920px] h-[648px] bg-[rgba(15,23,42,0.95)] backdrop-blur-[20px] border border-[rgba(255,255,255,0.1)] rounded-lg shadow-2xl z-[70] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[rgba(255,255,255,0.1)]">
          <h2 className="text-xl font-bold text-white">Управление СВОР</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-white hover:bg-[rgba(255,255,255,0.1)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Левая панель - Список загруженных СВОР */}
          <div className="w-[648px] border-r border-[rgba(255,255,255,0.1)] flex flex-col bg-[rgba(65,64,64,0.1)]">
            {/* Заголовок левой панели */}
            <div className="p-4 border-b border-[rgba(255,255,255,0.1)] bg-[#070707]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">СВОР Классификатор</h3>
                <button
                  onClick={() => setShowUpload(!showUpload)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-white hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                  title="Загрузить СВОР"
                >
                  <Upload className="w-5 h-5" />
                </button>
              </div>
              
              {/* Поиск */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#999]" />
                <input
                  type="text"
                  placeholder="Поиск документов СВОР"
                  value={searchQueryLeft}
                  onChange={(e) => setSearchQueryLeft(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[rgba(17,24,39,0.8)] border-2 border-[rgba(255,255,255,0.1)] rounded-xl text-white placeholder:text-[#999] focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            {/* Список документов СВОР */}
            <div className="flex-1 overflow-y-auto bg-[rgba(255,255,255,0.02)]">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                </div>
              ) : showUpload ? (
                <div className="p-4">
                  <SVORUpload onUploadComplete={handleUploadComplete} />
                </div>
              ) : (
                <div className="divide-y divide-[rgba(255,255,255,0.1)]">
                  {filteredDocuments.length === 0 ? (
                    <div className="text-center py-12 text-[#999]">
                      {searchQueryLeft ? 'Ничего не найдено' : 'Нет загруженных документов СВОР'}
                    </div>
                  ) : (
                    filteredDocuments.map((document) => {
                      const isSelected = selectedDocumentId === document.id
                      const isEditing = editingDocumentId === document.id
                      const isMenuOpen = openMenuId === `svor-${document.id}`
                      
                      return (
                        <div
                          key={document.id}
                          className={`px-4 py-3 hover:bg-[rgba(255,255,255,0.05)] transition-colors ${
                            isSelected ? 'bg-[rgba(20,184,166,0.1)] border-l-2 border-primary-500' : ''
                          }`}
                          onClick={() => !isEditing && handleDocumentSelect(document.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected 
                                ? 'bg-primary-500 border-primary-500' 
                                : 'border-[rgba(255,255,255,0.3)]'
                            }`}>
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveRename()
                                    } else if (e.key === 'Escape') {
                                      handleCancelRename()
                                    }
                                  }}
                                  onBlur={handleSaveRename}
                                  autoFocus
                                  className="w-full bg-[rgba(255,255,255,0.1)] border border-primary-500 rounded px-2 py-1 text-white font-semibold focus:outline-none focus:ring-1 focus:ring-primary-500"
                                  disabled={isUpdating}
                                />
                              ) : (
                                <>
                                  <div className="text-white font-semibold">
                                    {document.name}
                                  </div>
                                  <div className="text-sm text-[#999] mt-1">
                                    {new Date(document.createdAt).toLocaleDateString('ru-RU')}
                                  </div>
                                </>
                              )}
                            </div>
                            {!isEditing && (
                              <div className="relative flex-shrink-0" data-menu-id={`svor-${document.id}`}>
                                <button
                                  onClick={(e) => handleMenuClick(e, document.id)}
                                  className={`h-8 w-8 flex items-center justify-center rounded text-[#999] hover:bg-[rgba(20,184,166,0.2)] hover:text-primary-500 transition-all duration-200 ${
                                    isMenuOpen ? 'bg-[rgba(20,184,166,0.2)] text-primary-500' : ''
                                  }`}
                                  title="Настройки СВОР"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Правая панель - Выбранные позиции */}
          <div className="flex-1 flex flex-col bg-[rgba(255,255,255,0.1)]">
            {/* Заголовок правой панели */}
            <div className="p-4 border-b border-[rgba(255,255,255,0.1)]">
              <h3 className="text-lg font-semibold text-white mb-3">
                {selectedDocumentId 
                  ? `Позиции: ${documents.find(d => d.id === selectedDocumentId)?.name || 'СВОР'}`
                  : 'Позиции классификатора'
                }
              </h3>
              
              {/* Поиск */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#999]" />
                <input
                  type="text"
                  placeholder="Поиск позиций классификатора"
                  value={searchQueryRight}
                  onChange={(e) => setSearchQueryRight(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[rgba(17,24,39,0.8)] border-2 border-[rgba(255,255,255,0.1)] rounded-xl text-white placeholder:text-[#999] focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            {/* Список позиций выбранного документа */}
            <div className="flex-1 overflow-y-auto bg-[rgba(255,255,255,0.02)]">
              {!selectedDocumentId ? (
                <div className="text-center py-12 text-[#999]">
                  Выберите документ СВОР в левой панели
                </div>
              ) : loadingPositions ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                </div>
              ) : filteredRightPositions.length === 0 ? (
                <div className="text-center py-12 text-[#999]">
                  {searchQueryRight ? 'Ничего не найдено' : 'Нет позиций в выбранном документе СВОР'}
                </div>
              ) : (
                <div className="divide-y divide-[rgba(255,255,255,0.1)]">
                  {filteredRightPositions.map((position) => {
                    const isSelected = selectedPositionIds.has(position.id)
                    // Убрана группировка - показываем все позиции
                    return (
                      <div
                        key={position.id}
                        className={`px-4 py-4 hover:bg-[rgba(255,255,255,0.05)] transition-colors cursor-pointer ${
                          isSelected ? 'bg-[rgba(20,184,166,0.1)]' : ''
                        }`}
                        onClick={() => handleToggleSelection(position.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isSelected 
                              ? 'bg-primary-500 border-primary-500' 
                              : 'border-[rgba(255,255,255,0.3)]'
                          }`}>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="text-primary-400 font-bold text-sm">
                                {position.svorCode}
                              </div>
                            </div>
                            <div className="text-white font-semibold mb-1">
                              {position.svorName}
                            </div>
                            {position.svorDescription && (
                              <div className="text-sm text-[#ccc] line-clamp-2">
                                {position.svorDescription}
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

            {/* Кнопки выбора всех/отмены всех */}
            {selectedDocumentId && positions.length > 0 && (
              <div className="p-4 border-t border-[rgba(255,255,255,0.1)] flex items-center gap-4">
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-white hover:text-primary-400 transition-colors"
                >
                  Выбрать все
                </button>
                <button
                  onClick={handleDeselectAll}
                  className="text-sm text-white hover:text-primary-400 transition-colors"
                >
                  Отменить все
                </button>
                {saving && (
                  <div className="flex items-center gap-2 text-sm text-[#999] ml-auto">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Сохранение...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Меню действий */}
      {typeof window !== 'undefined' && openMenuId && menuPosition && createPortal(
        <div
          data-menu-dropdown
          className="bg-[rgba(30,30,30,0.95)] border border-[rgba(255,255,255,0.1)] rounded-lg shadow-xl min-w-[160px] backdrop-blur-sm"
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 999999,
            isolation: 'isolate',
            pointerEvents: 'auto',
          } as React.CSSProperties & { zIndex: number }}
        >
          {openMenuId.startsWith('svor-') && (() => {
            const documentId = openMenuId.replace('svor-', '')
            const document = documents.find((d) => d.id === documentId)
            if (!document) return null
            return (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRenameDocument(document)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-[rgba(20,184,166,0.1)] transition-colors first:rounded-t-lg"
                >
                  <Edit2 className="w-4 h-4" />
                  Переименовать
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteDocument(document)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors last:rounded-b-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  Удалить
                </button>
              </>
            )
          })()}
        </div>,
        document.body
      )}

      {/* Модальное окно подтверждения удаления */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-[rgba(30,30,30,0.95)] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Удалить СВОР
              </h3>
              <button
                onClick={() => setShowDeleteModal(null)}
                disabled={isDeleting}
                className="text-[#ccc] hover:text-white transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-[#ccc]">
                Вы уверены, что хотите удалить СВОР{' '}
                <span className="font-semibold text-white">{showDeleteModal.name}</span>?
              </p>
              <span className="block text-sm text-red-400">
                - Все связанные позиции будут удалены. - Это действие нельзя отменить.
              </span>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowDeleteModal(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-[#ccc] hover:text-white transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

