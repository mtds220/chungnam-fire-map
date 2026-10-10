// Iconify Solar 아이콘. 웹 컴포넌트 <iconify-icon> 을 감싼다.
import 'iconify-icon'

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'iconify-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        icon: string
        width?: string | number
        height?: string | number
      }
    }
  }
}

export default function Icon({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }) {
  return <iconify-icon icon={`solar:${name}`} width={size} height={size} className={`inline-block shrink-0 ${className}`} aria-hidden="true" />
}
