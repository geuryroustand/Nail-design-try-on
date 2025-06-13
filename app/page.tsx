import NailTryOn from "@/components/nail-try-on"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-100 py-8 px-4 flex flex-col items-center">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-pink-600">Virtual Nail Salon</h1>
        <p className="text-gray-700 mt-2">Try on trendy nail designs instantly!</p>
      </header>
      <NailTryOn />
      <footer className="mt-12 text-center text-sm text-gray-600">
        <p>&copy; {new Date().getFullYear()} v0 Nail Designs. All rights reserved.</p>
        <p className="mt-1">Powered by MediaPipe & Next.js</p>
      </footer>
    </div>
  )
}
