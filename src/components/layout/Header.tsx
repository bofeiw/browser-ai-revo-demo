import { Sparkles } from 'lucide-react'
export function Header() {
 return <header className="border-b border-white/10 bg-white/[0.02]"><div className="mx-auto max-w-5xl px-4 py-6 sm:px-6"><div className="flex items-center gap-3"><Sparkles className="size-5 text-amber-300"/><h1 className="text-xl font-semibold text-white">Browser AI · RevoSurge Lab</h1></div><p className="mt-2 text-sm text-gray-400">四个小工具，直接在你的浏览器里运行。</p></div></header>
}
