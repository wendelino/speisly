import WBackLayout from "../(static)/layout";

export default function MealLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WBackLayout>{children}</WBackLayout>;
}
