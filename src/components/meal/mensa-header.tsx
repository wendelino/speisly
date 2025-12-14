import Title from "../title";

export function MensaHeader({ mensa }: { mensa: Mensa }) {
  return (
    <div className="sticky top-0 z-10 p-1">
      <Title
        className="my-0 w-fit rounded-md bg-primary px-4 py-1 font-bold text-primary-foreground text-sm shadow-lg sm:text-base"
        noBorder
        variant="h2"
      >
        {mensa.name}
      </Title>
    </div>
  );
}
