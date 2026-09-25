import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Abiko AI Tutor',
  description: 'AI-powered learning support application for university entrance exams.',
}

import { UserProvider } from '@/lib/UserContext'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  )
}
