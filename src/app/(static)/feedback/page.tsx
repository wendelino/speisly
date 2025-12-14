import { MessageSquareHeart } from "lucide-react";
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
  title: "Feedback",
  description: "Teilen Sie uns Ihr Feedback mit",
};

export const dynamic = "force-static";
export default function FeedbackPage() {
  return (
    <>
      <div className="mb-10 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <MessageSquareHeart className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mb-3 font-bold text-4xl">Feedback</h1>
        <p className="mx-auto max-w-lg text-lg text-muted-foreground">
          Wir freuen uns über dein Feedback! Erzähl uns, was dir gefällt oder
          was wir besser machen können. Alles ist anonym :)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dein Feedback</CardTitle>
          <CardDescription>
            Helfe uns, Speisly kontinuierlich zu verbessern.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContactForm variant="feedback" />
        </CardContent>
      </Card>
    </>
  );
}
