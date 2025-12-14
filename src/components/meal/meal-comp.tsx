"use client";
import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useState, ViewTransition } from "react";
import { cn } from "@/lib/utils";
import Title from "../title";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";

type MealTitleProps = {
  name: string;
  subtitle: string;
  mmid?: string;
  h1?: boolean;
};
export function MealTitle({
  name,
  subtitle,
  mmid,
  h1 = false,
}: MealTitleProps) {
  const viewTransitionName = mmid ? `meal-title-${mmid}` : undefined;
  return (
    <ViewTransition name={viewTransitionName}>
      {h1 ? (
        <Title className="mt-0" noBorder variant="h1">
          {name} {subtitle}
        </Title>
      ) : (
        <Title
          className="my-0 line-clamp-2 text-sm transition-colors group-hover:text-primary"
          noBorder
          variant="h4"
        >
          {name} {subtitle}
        </Title>
      )}
    </ViewTransition>
  );
}
type MealPriceProps = {
  meal: Pick<Meal, "priceStud" | "priceWork" | "priceGuest">;
  expanded?: boolean;
  viewId?: string;
};
const SinglePrice = ({
  price,
  label,
  showLabel = false,
}: {
  price: number;
  label: string;
  showLabel?: boolean;
}) => {
  const cents = price % 100;
  const euros = Math.floor(price / 100);
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      {showLabel ? (
        <Label className="text-muted-foreground">{label}</Label>
      ) : null}
      <span className="font-extrabold text-lg text-primary tabular-nums leading-tight tracking-tight">
        {euros},
        <span className="text-base">{cents.toString().padStart(2, "0")}</span>
        <span className="ml-1 text-base text-primary/80">€</span>
      </span>
    </div>
  );
};
export function MealPrice({ meal, expanded = false, viewId }: MealPriceProps) {
  const viewTransitionName = viewId ? `meal-price-${viewId}` : undefined;

  return (
    <div className="grid grid-cols-3 gap-2">
      <ViewTransition name={viewTransitionName}>
        <SinglePrice
          label="Student*in"
          price={meal.priceStud}
          showLabel={expanded}
        />
      </ViewTransition>
      {expanded ? (
        <>
          <SinglePrice
            label="Mitarbeiter*in"
            price={meal.priceWork}
            showLabel
          />
          <SinglePrice label="Besucher*in" price={meal.priceGuest} showLabel />
        </>
      ) : null}
    </div>
  );
}

type MealImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  viewId?: string;
  quality?: number;
  priority?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
  view?: "card" | "detail";
};

const DEFAULT_IMAGE_WIDTH = 500;
const DEFAULT_IMAGE_HEIGHT = 375; // 4:3 aspect ratio
const DEFAULT_QUALITY = 75;
const DEFAULT_SIZES =
  "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw";

export function MealImage({
  src,
  alt,
  className,
  viewId,
  quality = DEFAULT_QUALITY,
  priority = false,
  sizes = DEFAULT_SIZES,
  width = DEFAULT_IMAGE_WIDTH,
  height = DEFAULT_IMAGE_HEIGHT,
  view = "card",
}: MealImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const viewTransitionName = viewId ? `meal-image-${viewId}` : undefined;

  return (
    <div
      className={cn(
        "relative aspect-4/3 overflow-hidden rounded-lg transition-all duration-300",
        className
      )}
      style={{ viewTransitionName }}
    >
      {src ? (
        <>
          {isLoading ? (
            <Skeleton className="absolute inset-0 h-full w-full rounded-lg" />
          ) : null}
          <Image
            alt={alt}
            className={cn(
              "h-full w-full object-contain transition-opacity duration-300",
              isLoading ? "opacity-0" : "opacity-100"
            )}
            fetchPriority={priority ? "high" : "auto"}
            height={height}
            loading={priority ? "eager" : "lazy"}
            onError={() => {
              setIsLoading(false);
            }}
            onLoad={() => setIsLoading(false)}
            preload={priority}
            quality={quality}
            sizes={sizes}
            src={src}
            width={width}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-border/30 bg-muted/50">
          <ImageOff
            className={cn(
              "size-16 text-border",
              view === "detail" ? "size-32" : ""
            )}
          />
        </div>
      )}
    </div>
  );
}
