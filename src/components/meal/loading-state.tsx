import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function MealLoadingState() {
  return (
    <section className="bg-primary/5 pb-8">
      {/* Simuliere mehrere Mensa-Gruppen */}
      {[1, 2].map((mensaIndex) => (
        <div key={mensaIndex}>
          {/* Mensa Header Skeleton */}
          <div className="p-2">
            <Skeleton className="h-7 w-32 bg-primary" />
          </div>

          {/* Meal Cards Grid */}
          <div className="grid gap-4 px-4 pt-2 pb-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4].map((mealIndex) => (
              <Card
                className="grid grid-cols-3 gap-4 border-none p-4 shadow-sm"
                key={mealIndex}
              >
                {/* Image Skeleton */}
                <Skeleton className="aspect-4/3 h-full w-full rounded-lg" />

                {/* Content Skeleton */}
                <CardContent className="col-span-2 flex h-full flex-col justify-between gap-3 p-0">
                  {/* Ingredients Badges Skeleton */}
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                  </div>

                  {/* Title Skeleton */}
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>

                  {/* Footer Skeleton */}
                  <div className="mt-auto flex items-center justify-between">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-5 w-5 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
