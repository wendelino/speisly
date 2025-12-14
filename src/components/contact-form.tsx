"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  CheckCircle2,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { submitFeedback } from "@/actions/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const feedbackSchema = z.object({
  message: z
    .string()
    .min(10, "Hey, mindestens 10 Zeichen bitte 😊")
    .max(2000, "Wow, das ist ganz schön lang! Maximal 2000 Zeichen bitte"),
});

const contactSchema = z.object({
  email: z
    .string()
    .min(1, "E-Mail-Adresse fehlt noch")
    .email("Hmm, das sieht nicht nach einer gültigen E-Mail aus 🤔"),
  message: z
    .string()
    .min(10, "Hey, mindestens 10 Zeichen bitte 😊")
    .max(2000, "Wow, das ist ganz schön lang! Maximal 2000 Zeichen bitte"),
  dsgvoConsent: z
    .boolean("Bitte stimme der Datenschutzerklärung zu")
    .refine((val) => val === true, {
      message: "Bitte stimme der Datenschutzerklärung zu",
    }),
});

type FeedbackFormValues = z.infer<typeof feedbackSchema>;
type ContactFormValues = z.infer<typeof contactSchema>;

type ContactFormProps = {
  variant?: "feedback" | "contact";
  onSubmit?: (data: FeedbackFormValues | ContactFormValues) => Promise<void>;
};

export function ContactForm({
  variant = "feedback",
  onSubmit,
}: ContactFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = variant === "feedback" ? feedbackSchema : contactSchema;
  const form = useForm<FeedbackFormValues | ContactFormValues>({
    resolver: zodResolver(schema),
    defaultValues:
      variant === "feedback"
        ? { message: "" }
        : { email: "", message: "", dsgvoConsent: false },
  });

  const handleSubmit = async (data: FeedbackFormValues | ContactFormValues) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      if (onSubmit) {
        await onSubmit(data);
      } else {
        // Default submission to API
        await submitFeedback(data);
      }

      setSubmitSuccess(true);
      form.reset();

      // Show toast notification
      if (variant === "feedback") {
        toast.success("Super, danke für dein Feedback! 🎉");
      } else {
        toast.success(
          "Alles klar! Wir haben deine Nachricht erhalten und melden uns bald bei dir. ✨"
        );
      }

      // Reset success message after 5 seconds
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Ups, da ist etwas schiefgelaufen. Versuch's doch bitte nochmal! 😅";
      setSubmitError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(handleSubmit)}>
        {variant === "contact" && (
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Deine E-Mail-Adresse
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      placeholder="deine.email@beispiel.de"
                      type="email"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {variant === "feedback" ? "Was denkst du?" : "Deine Nachricht"}
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder={
                    variant === "feedback"
                      ? "Ich finde die Ladezeiten super! Aber ..."
                      : "Schreib uns einfach, was du auf dem Herzen hast. Wir hören gerne zu!"
                  }
                  rows={8}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {variant === "contact" && (
          <FormField
            control={form.control}
            name="dsgvoConsent"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-1 text-sm">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <p className="inline cursor-pointer font-normal text-sm">
                    Ich habe die{" "}
                    <a
                      className="inline text-primary underline hover:text-primary/80"
                      href="/datenschutz"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Datenschutzerklärung
                    </a>{" "}
                    gelesen und stimme der Verarbeitung meiner Daten zu.
                  </p>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        )}

        {submitError ? (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <p className="text-destructive text-sm">{submitError}</p>
          </div>
        ) : null}

        {submitSuccess ? (
          <div className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <p className="text-green-600 text-sm dark:text-green-400">
              {variant === "feedback"
                ? "Super, danke für dein Feedback! 🎉"
                : "Alles klar! Wir haben deine Nachricht erhalten und melden uns bald bei dir. ✨"}
            </p>
          </div>
        ) : null}

        <Button
          className="w-full gap-2"
          disabled={isSubmitting}
          size="lg"
          type="submit"
        >
          {isSubmitting ? (
            <>
              <Send className="h-4 w-4 animate-pulse" />
              Wird verschickt...
            </>
          ) : variant === "feedback" ? (
            <>
              <Sparkles className="h-4 w-4" />
              Feedback abschicken
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Abschicken
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
