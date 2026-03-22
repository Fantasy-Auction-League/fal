import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-bold">404</h2>
      <p className="mt-2 text-gray-400">Page not found</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200"
      >
        Go home
      </Link>
    </main>
  )
}
