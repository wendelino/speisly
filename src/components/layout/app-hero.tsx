import Image from "next/image";
import Title from "../title";
export function AppHeroVariant() {
  return (
    <div className="bg-linear-to-b from-primary/40 to-transparent p-4 py-16 pt-8 md:py-32">
      <div className="mx-auto flex max-w-lg items-center gap-5 rounded-2xl bg-background p-5">
        <div className="shrink-0">
          <Image
            alt="Speisly Logo"
            className="w-16 rounded-xl shadow-md sm:w-24"
            fetchPriority="high"
            height={96}
            preload
            sizes="(max-width: 640px) 80px, 96px"
            src="/logo_full.png"
            width={96}
          />
        </div>
        <div className="flex-1">
          <Title className="my-0 sm:mb-1" noBorder variant="h1">
            Speisly<span className="text-primary">.de</span>
          </Title>
          <p className="text-lg text-muted-foreground sm:text-xl">
            Interaktiver Speiseplan
          </p>
        </div>
      </div>
    </div>
  );
}
