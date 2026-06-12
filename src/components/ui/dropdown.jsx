"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Search, ChevronDown, X, Check } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

function Dropdown({
  value,
  onValueChange,
  placeholder = "Select an option",
  options = [],
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  renderOption,
  align = "start",
  contentClassName,
  disabled,
  className,
  children,
}) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  React.useEffect(() => {
    if (!open) setSearchValue("")
  }, [open])

  const filteredOptions = React.useMemo(
    () => options.filter((opt) => opt.label?.toLowerCase().includes(searchValue.toLowerCase())),
    [options, searchValue]
  )

  const selected = options.find((opt) => opt.value === value)
  const label = children || selected?.label || placeholder

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="dropdown-trigger"
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
            className
          )}
        >
          <span className={cn("flex-1 text-left truncate", !value && !children && "text-muted-foreground")}>
            {label}
          </span>
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn("p-0 w-auto", contentClassName)}
        style={{ minWidth: "max(208px, var(--radix-popover-trigger-width))" }}
      >
        <div className="relative border-b border-input">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            data-slot="dropdown-search"
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full border-0 bg-transparent pl-8 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
            autoFocus
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => setSearchValue("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                data-slot="dropdown-item"
                type="button"
                onClick={() => {
                  onValueChange?.(option.value)
                  setOpen(false)
                }}
                className={cn(
                  "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2.5 text-sm outline-none select-none transition-colors hover:bg-accent hover:text-accent-foreground",
                  value === option.value && "bg-accent text-accent-foreground"
                )}
              >
                {option.icon && (
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {option.icon}
                  </span>
                )}
                {renderOption ? (
                  <span className="flex-1 text-left">{renderOption(option)}</span>
                ) : (
                  <span className="flex-1 text-left truncate">{option.label}</span>
                )}
                {value === option.value && (
                  <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                    <Check className="size-4" />
                  </span>
                )}
              </button>
            ))
          ) : (
            <div className="px-2.5 py-8 text-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { Dropdown }
