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
      },
      size: {
        default: "h-10 px-5 has-[>svg]:px-4",
        sm: "h-8 gap-1.5 px-3.5 text-xs has-[>svg]:px-3",
        lg: "h-12 px-7 text-base has-[>svg]:px-6",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/** Eingabefelder, gemeinsam für React (ui/input.tsx) und Astro-Formulare */
export const fieldClass =
  "w-full min-w-0 rounded-2xl border border-input bg-card px-4 text-base shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm";

/** Feldbeschriftung */
export const labelClass = "block font-semibold text-sm leading-none";

export type ButtonVariants = VariantProps<typeof buttonVariants>;
