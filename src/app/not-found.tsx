import { Home, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-static";
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md space-y-6 text-center">
        {/* 404 Number with icon */}
        <div className="relative">
          <div className="select-none font-bold text-9xl text-muted-foreground/50">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <UtensilsCrossed className="size-24 text-muted-foreground" />
          </div>
        </div>

        {/* Main message */}
        <div className="space-y-2">
          <h1 className="font-bold text-3xl text-foreground">
            Seite nicht gefunden
          </h1>
          <p className="text-lg text-muted-foreground">
            Diese Seite existiert leider nicht mehr oder wurde verschoben.
          </p>
        </div>

        {/* Action button */}
        <div className="pt-4">
          <Button asChild className="gap-2" size="lg">
            <Link href="/">
              <Home className="h-4 w-4" />
              Zur Startseite
            </Link>
          </Button>
        </div>

        {/* Decorative elements */}
        <div className="pt-8 text-muted-foreground text-sm">
          <p>Vielleicht finden Sie das gesuchte Gericht auf der Startseite?</p>
        </div>
      </div>
    </div>
  );
}
