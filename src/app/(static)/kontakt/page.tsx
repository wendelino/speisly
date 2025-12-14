import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Kontaktieren Sie uns",
};

export const dynamic = "force-static";
export default function KontaktPage() {
  return (
    <>
      <div className="mb-10 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mb-3 font-bold text-4xl">Kontakt</h1>
        <p className="mx-auto max-w-lg text-lg text-muted-foreground">
          Hast du Fragen oder Anliegen? Schreib uns einfach!
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schreib uns</CardTitle>
          <CardDescription>
            Füll einfach das Formular aus und wir melden uns schnellstmöglich
            bei dir zurück.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContactForm variant="contact" />
        </CardContent>
      </Card>
    </>
  );
}
