import { UniverseLayout } from '@/components/universe/universe-layout'

// Отключаем кэширование для этого layout
export const dynamic = 'force-dynamic'
export const revalidate = false

export default function AIClassifierLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <UniverseLayout currentApp="ai-classifier">{children}</UniverseLayout>
}

