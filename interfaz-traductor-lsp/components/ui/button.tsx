import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border bg-clip-padding text-sm font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-100 disabled:bg-slate-200 disabled:text-slate-600 disabled:border-slate-300 disabled:shadow-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'border-blue-700 bg-blue-700 text-white shadow-sm hover:bg-blue-800 hover:border-blue-800',
        outline:
          'border-slate-500 bg-white text-slate-800 hover:bg-blue-50 hover:border-blue-700 hover:text-blue-800 aria-expanded:bg-blue-50',
        secondary:
          'border-blue-200 bg-blue-100 text-blue-900 hover:bg-blue-200 aria-expanded:bg-blue-200',
        ghost:
          'border-transparent bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900 aria-expanded:bg-slate-100',
        destructive:
          'border-red-700 bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700',
        link: 'border-transparent text-blue-700 underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-11 gap-2 px-4',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-12 gap-2 px-5 text-base',
        icon: 'size-11',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
