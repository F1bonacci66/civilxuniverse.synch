'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(checked ?? false)

    React.useEffect(() => {
      if (checked !== undefined) {
        setInternalChecked(checked)
      }
    }, [checked])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = e.target.checked
      setInternalChecked(newChecked)
      if (onCheckedChange) {
        onCheckedChange(newChecked)
      }
    }

    return (
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          ref={ref}
          checked={internalChecked}
          onChange={handleChange}
          className="sr-only"
          {...props}
        />
        <div
          className={cn(
            'w-5 h-5 border-2 rounded transition-colors flex items-center justify-center',
            internalChecked
              ? 'bg-primary-500 border-primary-500'
              : 'bg-transparent border-[rgba(255,255,255,0.3)] hover:border-[rgba(255,255,255,0.5)]',
            className
          )}
        >
          {internalChecked && (
            <Check className="w-3 h-3 text-white" />
          )}
        </div>
      </label>
    )
  }
)

Checkbox.displayName = 'Checkbox'

export { Checkbox }

