/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone режим для оптимизации Docker образа
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // Rewrite отключен - API запросы обрабатываются напрямую через Nginx
  // Если NEXT_PUBLIC_API_URL - относительный путь (/api/datalab), запросы идут через Nginx
  // Если NEXT_PUBLIC_API_URL - полный URL, запросы идут напрямую к API
  async rewrites() {
    // Проксируем API запросы на backend через Next.js route handler
    // Route handler находится в app/api/datalab/[...path]/route.ts
    // Это работает и в development, и в production
    return []
  },
}

// Для production используем Node.js сервер (не статический экспорт)
// Статический экспорт не поддерживает динамические роуты с 'use client'
// Используйте Node.js сервер + Nginx reverse proxy для production
// if (process.env.NODE_ENV === 'production') {
//   nextConfig.output = 'export'
//   nextConfig.basePath = '/universe-app'
//   nextConfig.assetPrefix = '/universe-app'
// }

export default nextConfig

