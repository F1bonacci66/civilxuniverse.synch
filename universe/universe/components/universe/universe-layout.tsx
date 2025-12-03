'use client'

import { usePathname } from 'next/navigation'
import { GlobalHeader } from './global-header'
import { Sidebar } from './sidebar'
import { ToastContainer } from '@/components/ui/toast'

interface UniverseLayoutProps {
  children: React.ReactNode
  currentApp?: string
}

export function UniverseLayout({
  children,
  currentApp = 'datalab',
}: UniverseLayoutProps) {
  const pathname = usePathname()

  // Извлекаем projectId и versionId из пути
  const pathSegments = pathname.split('/')
  const projectIndex = pathSegments.indexOf('project')
  const versionIndex = pathSegments.indexOf('version')
  
  const projectId = projectIndex !== -1 && pathSegments[projectIndex + 1] 
    ? pathSegments[projectIndex + 1] 
    : undefined
  
  const versionId = versionIndex !== -1 && pathSegments[versionIndex + 1] 
    ? pathSegments[versionIndex + 1] 
    : undefined

  return (
    <div className="min-h-screen bg-body-gradient">
      <GlobalHeader currentApp={currentApp} />
      <Sidebar projectId={projectId} versionId={versionId} />
      <main className="ml-64 pt-16 min-h-screen">
        {children}
      </main>
      <ToastContainer />
    </div>
  )
}
