import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground hover:opacity-90",
        secondary: "bg-secondary text-foreground hover:bg-border",
        ghost: "text-muted hover:bg-secondary hover:text-foreground",
        outline: "border border-border bg-transparent hover:bg-secondary",
        danger: "bg-red-500/15 text-[color:var(--forge-err)] hover:bg-red-500/25",
        success: "bg-emerald-500/15 text-[color:var(--forge-ok)] hover:bg-emerald-500/25",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
