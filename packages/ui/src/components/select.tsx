"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";

import { cn } from "#lib/utils";

const EMPTY_VALUE = "__canopy_select_empty_value__";

const selectTriggerVariants = cva(
  "group/select-trigger flex w-full min-w-0 items-center justify-between gap-2.5 overflow-hidden rounded-lg border border-input bg-card text-left font-sans whitespace-nowrap text-foreground outline-none transition-[border-color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-on-ink-muted disabled:opacity-70 data-[placeholder]:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 aria-invalid:border-validation aria-invalid:ring-2 aria-invalid:ring-validation/15 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:overflow-hidden [&_[data-slot=select-value]]:text-ellipsis [&_[data-slot=select-value]]:whitespace-nowrap",
  {
    variants: {
      size: {
        xs: "h-8 px-2.5 text-[11px]",
        sm: "h-9 px-3 text-[13px]",
        default: "h-11 px-4 text-sm",
        md: "h-12 px-[18px] text-[15px]",
        lg: "h-13 px-5.5 text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type SelectSize = NonNullable<VariantProps<typeof selectTriggerVariants>["size"]>;

type LegacySelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: SelectSize;
};

function hasNativeOptions(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return false;
    if (child.type === "option" || child.type === "optgroup") return true;
    return hasNativeOptions(child.props.children);
  });
}

function textContent(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

function renderNativeOptions(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child, index) => {
    if (!React.isValidElement<React.ComponentProps<"option"> & { label?: string }>(child)) return child;
    if (child.type === React.Fragment) return renderNativeOptions(child.props.children);
    if (child.type === "optgroup") {
      return (
        <SelectGroup key={child.key ?? index}>
          <SelectLabel>{child.props.label}</SelectLabel>
          {renderNativeOptions(child.props.children)}
        </SelectGroup>
      );
    }
    if (child.type !== "option") return null;
    const label = child.props.label ?? textContent(child.props.children);
    const value = String(child.props.value ?? label);
    return (
      <SelectItem disabled={child.props.disabled} key={child.key ?? index} value={value || EMPTY_VALUE}>
        {child.props.children ?? child.props.label}
      </SelectItem>
    );
  });
}

function findEmptyLabel(children: React.ReactNode): React.ReactNode {
  for (const child of React.Children.toArray(children)) {
    if (!React.isValidElement<React.ComponentProps<"option"> & { label?: string }>(child)) continue;
    if (child.type === "option" && String(child.props.value ?? textContent(child.props.children)) === "") {
      return child.props.children ?? child.props.label;
    }
    const nested = findEmptyLabel(child.props.children);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function findOptionLabel(children: React.ReactNode, selectedValue: string): React.ReactNode {
  for (const child of React.Children.toArray(children)) {
    if (!React.isValidElement<React.ComponentProps<"option"> & { label?: string }>(child)) continue;
    if (child.type === "option" && String(child.props.value ?? textContent(child.props.children)) === selectedValue) {
      return child.props.children ?? child.props.label;
    }
    const nested = findOptionLabel(child.props.children, selectedValue);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function LegacySelect({
  children,
  className,
  defaultValue,
  id,
  onChange,
  size = "default",
  value,
  ...props
}: LegacySelectProps) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(String(defaultValue ?? ""));
  const selectedValue = controlled ? String(value ?? "") : internalValue;
  const radixValue = selectedValue || EMPTY_VALUE;

  function handleValueChange(nextValue: string) {
    const actualValue = nextValue === EMPTY_VALUE ? "" : nextValue;
    if (!controlled) setInternalValue(actualValue);
    if (onChange) {
      const target = { id: id ?? "", name: props.name ?? "", value: actualValue };
      onChange({ currentTarget: target, target } as React.ChangeEvent<HTMLSelectElement>);
    }
  }

  return (
    <SelectPrimitive.Root
      autoComplete={props.autoComplete}
      disabled={props.disabled}
      form={props.form}
      name={props.name}
      onValueChange={handleValueChange}
      required={props.required}
      value={radixValue}
    >
      <SelectTrigger
        aria-describedby={props["aria-describedby"]}
        aria-errormessage={props["aria-errormessage"]}
        aria-invalid={props["aria-invalid"]}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        className={className}
        id={id}
        size={size}
      >
        <SelectValue placeholder={findEmptyLabel(children) ?? "Select…"}>
          {findOptionLabel(children, selectedValue)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>{renderNativeOptions(children)}</SelectContent>
    </SelectPrimitive.Root>
  );
}

type SelectProps = Omit<React.ComponentProps<typeof SelectPrimitive.Root>, "children" | "defaultValue" | "value"> & {
  children?: React.ReactNode;
  className?: string;
  defaultValue?: React.ComponentProps<"select">["defaultValue"];
  id?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  size?: SelectSize;
  value?: React.ComponentProps<"select">["value"];
  "aria-describedby"?: string;
  "aria-errormessage"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

function Select(props: SelectProps) {
  if (hasNativeOptions(props.children)) return <LegacySelect {...(props as LegacySelectProps)} />;
  return <SelectPrimitive.Root data-slot="select" {...(props as React.ComponentProps<typeof SelectPrimitive.Root>)} />;
}

function SelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("min-w-0 flex-1 truncate whitespace-nowrap text-left", className)}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: SelectSize;
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(selectTriggerVariants({ size }), className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-[transform,color] group-data-[size=xs]/select-trigger:size-3.5 group-data-[size=sm]/select-trigger:size-[15px] group-data-[size=md]/select-trigger:size-[18px] group-data-[size=lg]/select-trigger:size-5 group-data-[state=open]/select-trigger:rotate-180 group-data-[state=open]/select-trigger:text-primary" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-lg",
          className,
        )}
        position={position}
        align={align}
        sideOffset={4}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className="w-full p-1">{children}</SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(
        "px-2.5 py-2 font-caption text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-9 w-full cursor-default select-none items-center rounded-sm py-[9px] pr-9 pl-2.5 font-sans text-sm text-foreground outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted data-[state=checked]:bg-accent data-[state=checked]:font-semibold data-[state=checked]:text-primary",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 grid size-[15px] place-items-center text-primary">
        <CheckIcon className="size-[15px]" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn("flex h-7 cursor-default items-center justify-center bg-card", className)}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn("flex h-7 cursor-default items-center justify-center bg-card", className)}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  selectTriggerVariants,
};
export type { SelectProps, SelectSize };
