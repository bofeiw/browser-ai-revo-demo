import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

/** Small pill used for tech tags (WebGPU, WebAssembly, etc.). */
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-white/10',
        'bg-white/5 px-2.5 py-0.5 text-xs font-medium text-gray-300',
        className,
      )}
      {...props}
    />
  )
}
