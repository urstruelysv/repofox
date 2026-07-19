import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'RepoFox — The git workflow standard',
  description: 'AI transformed how code is written. RepoFox is how it ships. Branch to PR in one click, without leaving your editor.',
  openGraph: {
    title: 'RepoFox — The git workflow standard',
    description: 'AI transformed how code is written. RepoFox is how it ships.',
    url: 'https://repofox.dev',
    siteName: 'RepoFox',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@repofox',
    images: ['/og.png'],
  },
  icons: { icon: '/favicon.svg' },
  metadataBase: new URL('https://repofox.dev'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        {children}
      </body>
    </html>
  )
}
