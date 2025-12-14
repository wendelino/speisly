"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BackButtonProps = {
  href?: string;
  label?: string;
  className?: string;
};

export function BackButton({
  href = "/",
  label = "Zurück",
  className,
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    // Versuche zuerst router.back()
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      // Fallback zu href falls kein History vorhanden
      router.push(href);
    }
  };

  return (
    <Button asChild className={cn("text-primary", className)} variant="ghost">
      <Link href={href} onClick={handleClick}>
        <ArrowLeft className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}
