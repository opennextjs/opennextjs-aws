import Head from 'next/head'
import { Inter } from '@next/font/google'
import Nav from '@open-next/core/components/Nav'
const inter = Inter({ subsets: ['latin'] })

export default function Home() {
  return (
    <>
      <Head>
        <title>Nextjs Pages only</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        <h1>Nextjs Pages Only</h1>
        <div className='grid grid-cols-2 mt-2 [&>*]:mx-4'>
          <Nav href="/isr" title='/ISR' icon='/static/frank.webp'>
            revalidates every 10 seconds
          </Nav>
          <Nav href="/ssr" title='/SSR' icon='/static/frank.webp'>
            revalidates every 10 seconds
          </Nav>
        </div>
      </main>
    </>
  )
}
