'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { DataTable } from '@/components/datalab/DataTable'
import { getFileUploads } from '@/lib/api/upload'
import type { FileUpload } from '@/lib/types/upload'

export default function ModelDataPage({
  params,
}: {
  params: { projectId: string; versionId: string; modelId: string }
}) {
  const [loading, setLoading] = useState(true)
  const [csvFile, setCsvFile] = useState<FileUpload | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Загружаем CSV файлы для этой версии
  useEffect(() => {
    const loadCSVFiles = async () => {
      try {
        setLoading(true)
        const files = await getFileUploads(params.projectId, params.versionId)
        
        // Ищем CSV файл, связанный с этой моделью (или просто первый CSV файл)
        const csvFiles = files.filter(f => f.fileType === 'CSV')
        const modelFile = csvFiles.find(f => f.modelId === params.modelId) || csvFiles[0]
        
        setCsvFile(modelFile || null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки файлов')
        console.error('Error loading CSV files:', err)
      } finally {
        setLoading(false)
      }
    }

    loadCSVFiles()
  }, [params.projectId, params.versionId, params.modelId])

  return (
    <div className="p-8">
      <div className="max-w-[1920px] mx-auto">
        <div className="mb-6">
          <Link
            href={`/app/datalab/project/${params.projectId}/version/${params.versionId}`}
            className="text-primary-500 hover:text-primary-400 text-sm mb-4 inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к моделям
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gradient mb-2">Таблица данных</h1>
              <p className="text-[#ccc] text-lg">
                Проект: {params.projectId} | Версия: {params.versionId}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-[rgba(0,0,0,0.6)] backdrop-blur-[10px] rounded-lg p-12 border border-[rgba(255,255,255,0.1)] text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary-500" />
            <p className="text-[#999]">Загрузка данных...</p>
          </div>
        ) : error ? (
          <div className="bg-[rgba(0,0,0,0.6)] backdrop-blur-[10px] rounded-lg p-6 border border-[rgba(255,255,255,0.1)]">
            <p className="text-red-400 mb-2">Ошибка загрузки</p>
            <p className="text-[#999] text-sm">{error}</p>
          </div>
        ) : !csvFile ? (
          <div className="bg-[rgba(0,0,0,0.6)] backdrop-blur-[10px] rounded-lg p-6 border border-[rgba(255,255,255,0.1)]">
            <p className="text-[#999]">
              CSV файлы не найдены для этой версии. Загрузите файл через{' '}
              <Link href="/app/datalab/upload" className="text-primary-500 hover:text-primary-400">
                страницу загрузки
              </Link>
              .
            </p>
          </div>
        ) : (
          <DataTable
            fileUploadId={csvFile.id}
            projectId={params.projectId}
            versionId={params.versionId}
          />
        )}
      </div>
    </div>
  )
}
