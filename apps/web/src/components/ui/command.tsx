import { MagnifyingGlassIcon, CheckIcon } from "@phosphor-icons/react"
import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

type CommandItemState = {
  readonly disabled: boolean
  readonly groupId: string | undefined
  readonly value: string
}

type CommandContextValue = {
  readonly items: ReadonlyMap<string, CommandItemState>
  readonly query: string
  readonly register: (id: string, item: CommandItemState) => () => void
  readonly setQuery: (query: string) => void
}

const CommandContext = React.createContext<CommandContextValue | null>(null)
const CommandGroupContext = React.createContext<string | undefined>(undefined)

function useCommand() {
  const context = React.useContext(CommandContext)
  if (!context) {
    throw new Error("Command components must be used within Command.")
  }

  return context
}

function matchesQuery(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
}

function textValue(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .flatMap((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return [String(child)]
      }
      if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
        return [textValue(child.props.children)]
      }
      return []
    })
    .join(" ")
}

function Command({ className, ...props }: React.ComponentProps<"div">) {
  const [query, setQuery] = React.useState("")
  const [items, setItems] = React.useState<ReadonlyMap<string, CommandItemState>>(new Map())
  const register = React.useCallback((id: string, item: CommandItemState) => {
    setItems((current) => new Map(current).set(id, item))
    return () => {
      setItems((current) => {
        const next = new Map(current)
        next.delete(id)
        return next
      })
    }
  }, [])

  return (
    <CommandContext.Provider value={{ items, query, register, setQuery }}>
      <div
        data-slot="command"
        className={cn(
          "flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground",
          className,
        )}
        {...props}
      />
    </CommandContext.Provider>
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  children: React.ReactNode
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0", className)}
        showCloseButton={showCloseButton}
      >
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({ className, onChange, ...props }: React.ComponentProps<"input">) {
  const { query, setQuery } = useCommand()
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <input
          data-slot="command-input"
          className={cn(
            "w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            onChange?.(event)
          }}
          {...props}
        />
        <InputGroupAddon>
          <MagnifyingGlassIcon strokeWidth={2} className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function CommandList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className,
      )}
      {...props}
    />
  )
}

function CommandEmpty({ className, ...props }: React.ComponentProps<"div">) {
  const { items, query } = useCommand()
  const isEmpty = ![...items.values()].some(
    (item) => !item.disabled && matchesQuery(item.value, query),
  )
  return (
    <div
      data-slot="command-empty"
      hidden={!isEmpty}
      className={cn("py-6 text-center text-sm", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  heading,
  children,
  ...props
}: React.ComponentProps<"div"> & { heading?: React.ReactNode }) {
  const id = React.useId()
  const { items, query } = useCommand()
  const isEmpty =
    query.length > 0 &&
    ![...items.values()].some(
      (item) => item.groupId === id && !item.disabled && matchesQuery(item.value, query),
    )

  return (
    <CommandGroupContext.Provider value={id}>
      <div
        data-slot="command-group"
        hidden={isEmpty}
        className={cn("overflow-hidden p-1 text-foreground", className)}
        {...props}
      >
        {heading && (
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{heading}</div>
        )}
        {children}
      </div>
    </CommandGroupContext.Provider>
  )
}

function CommandSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="separator"
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  children,
  disabled = false,
  onClick,
  onSelect,
  value,
  ...props
}: Omit<React.ComponentProps<"button">, "value"> & {
  disabled?: boolean
  onSelect?: (value: string) => void
  value?: string
}) {
  const id = React.useId()
  const groupId = React.useContext(CommandGroupContext)
  const { query, register } = useCommand()
  const itemValue = value ?? textValue(children)
  const matches = matchesQuery(itemValue, query)

  React.useLayoutEffect(
    () => register(id, { disabled, groupId, value: itemValue }),
    [disabled, groupId, id, itemValue, register],
  )

  return (
    <button
      type="button"
      data-slot="command-item"
      hidden={!matches}
      disabled={disabled}
      className={cn(
        "group/command-item relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-50 in-data-[slot=dialog-content]:rounded-lg! [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          onSelect?.(itemValue)
        }
      }}
      {...props}
    >
      {children}
      <CheckIcon
        strokeWidth={2}
        className="ml-auto hidden group-has-data-[slot=command-shortcut]/command-item:hidden"
      />
    </button>
  )
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-hover/command-item:text-foreground group-focus-within/command-item:text-foreground",
        className,
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
