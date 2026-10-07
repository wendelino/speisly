import { cva, type VariantProps } from "class-variance-authority";

/** Button-Stile, gemeinsam für React (ui/button.tsx) und Astro (ui/button.astro) */
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold text-sm outline-none transition-[background-color,color,box-shadow,translate,scale] duration-200 focus-visible:ring-[3px] focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/30 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "hover:-translate-y-0.5 bg-primary text-primary-foreground shadow-pop hover:bg-primary/92",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30",
        outline:
          "bg-card text-foreground shadow-soft ring-1 ring-border hover:bg-accent hover:text-accent-foreground hover:ring-primary/25",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "rounded-md text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 has-[>svg]:px-4",
        sm: "h-8 gap-1.5 px-3.5 text-xs has-[>svg]:px-3",
        lg: "h-12 px-7 text-base has-[>svg]:px-6",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/** Badge-Stile, für ui/badge.astro */
export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold text-xs [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "bg-card text-foreground ring-1 ring-border",
        muted: "bg-muted text-muted-foreground",
        sun: "bg-sun-soft text-sun",
        mint: "bg-mint-soft text-mint",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
export type BadgeVariants = VariantProps<typeof badgeVariants>;
