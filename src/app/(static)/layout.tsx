import { BackButton } from "@/components/layout/back-button";

export default async function WBackLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="container mx-auto max-w-4xl p-3 pt-6">
      <BackButton />
      <div className="space-y-4 p-3">{children}</div>
    </div>
  );
}
