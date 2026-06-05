"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Search, ChevronDown, X, Check } from "lucide-react"

const DropdownContext = React.createContext(null)

function Dropdown({
  value,
  onValueChange,
  placeholder = "Select an option",
  options = [],
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  children,
  ...props
}) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  return (
    <DropdownContext.Provider
      value={{ value, onValueChange, open, setOpen, searchValue, setSearchValue, placeholder, options, searchPlaceholder, emptyText }}
    >
      <div data-slot="dropdown" className={cn("relative", className)} {...props}>
        {children}
      </div>
    </DropdownContext.Provider>
  )
}

function DropdownTrigger({ className, children, ...props }) {
  const { value, open, setOpen, placeholder, options } = React.useContext(DropdownContext)

  const selected = options.find((opt) => opt.value === value)
  const label = selected?.label || placeholder

  return (
    <button
      data-slot="dropdown-trigger"
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        "flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className={cn("flex-1 text-left truncate", !value && "text-muted-foreground")}>
        {children || label}
      </span>
      <ChevronDown
        className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
      />
    </button>
  )
}

function DropdownContent({ className, align = "start", ...props }) {
  const {
    open, setOpen, searchValue, setSearchValue,
    searchPlaceholder, emptyText, options, value, onValueChange,
  } = React.useContext(DropdownContext)

  const filteredOptions = React.useMemo(
    () => options.filter((opt) => opt.label?.toLowerCase().includes(searchValue.toLowerCase())),
    [options, searchValue]
  )

  React.useEffect(() => {
    if (!open) setSearchValue("")
  }, [open, setSearchValue])

  const containerRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, setOpen])

  React.useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const timer = setTimeout(() => document.addEventListener("click", handleClickOutside), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("click", handleClickOutside)
    }
  }, [open, setOpen])

  if (!open) return null

  return (
    <div
      data-slot="dropdown-content"
      ref={containerRef}
      className={cn(
        "absolute z-50 mt-1 min-w-52 origin-top-right rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 overflow-hidden",
        align === "end" && "right-0",
        className
      )}
      {...props}
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
                "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2.5 text-sm outline-none select-none transition-colors hover:bg-accent hover:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
                value === option.value && "bg-accent text-accent-foreground"
              )}
            >
              {option.icon && (
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {option.icon}
                </span>
              )}
              <span className="flex-1 text-left truncate">{option.label}</span>
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
    </div>
  )
}

export { Dropdown, DropdownTrigger, DropdownContent }
