import { cn } from "@/lib/utils";

type TitleProps = {
  children: React.ReactNode;
  variant: "h1" | "h2" | "h3" | "h4";
  id?: string;
  className?: string;
  noBorder?: boolean;
};

export default function Title({
  children,
  className,
  variant,
  id,
  noBorder = false,
}: TitleProps) {
  const Tag =
    variant === "h1"
      ? "h1"
      : variant === "h2"
        ? "h2"
        : variant === "h3"
          ? "h3"
          : "h4";
  return (
    <Tag
      className={cn(
        "mt-16 mb-4 font-semibold",
        noBorder ? "" : "border-b pb-2",
        variant === "h1" &&
          "font-bold text-2xl leading-tight tracking-tight sm:text-4xl",
        variant === "h2" && "text-xl sm:text-2xl",
        variant === "h3" && "my-4 text-lg sm:text-xl",
        variant === "h4" && "my-2 text-base",
        className
      )}
      id={id}
    >
      {children}
    </Tag>
  );
}
