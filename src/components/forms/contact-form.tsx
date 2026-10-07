import { actions } from "astro:actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Mail, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { LoadingButton } from "@/components/ui/loading-button";
import { Textarea } from "@/components/ui/textarea";
import { FEEDBACK_MESSAGE } from "@/lib/feedback";

const messageSchema = z
  .string()
  .trim()
  .min(FEEDBACK_MESSAGE.min, "Bitte schreib mindestens 10 Zeichen.")
  .max(
    FEEDBACK_MESSAGE.max,
    "Das ist ganz schön lang. Maximal 2000 Zeichen, bitte."
  );

const feedbackSchema = z.object({
  message: messageSchema,
});

const contactSchema = z.object({
  email: z
    .string()
    .min(1, "E-Mail-Adresse fehlt noch")
    .pipe(z.email("Das sieht nicht nach einer gültigen E-Mail-Adresse aus.")),
  message: messageSchema,
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

  const successText =
    variant === "feedback"
      ? "Danke für dein Feedback!"
      : "Danke! Wir haben deine Nachricht erhalten und melden uns bald.";

  const handleSubmit = async (data: FeedbackFormValues | ContactFormValues) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      if (onSubmit) {
        await onSubmit(data);
      } else {
        const { error } = await actions.feedback.submit({
          message: data.message,
          email: "email" in data ? data.email : undefined,
        });
        if (error) {
          throw new Error(
            error.code === "INTERNAL_SERVER_ERROR"
              ? error.message
              : "Da ist etwas schiefgelaufen. Bitte versuch es noch einmal."
          );
        }
      }

      setSubmitSuccess(true);
      form.reset();

      toast.success(successText);

      // Erfolgsmeldung nach 5 Sekunden ausblenden
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.";
      setSubmitError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={form.handleSubmit(handleSubmit)}>
        {variant === "contact" && (
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deine E-Mail-Adresse</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="-translate-y-1/2 absolute top-1/2 left-4 size-4 text-muted-foreground" />
                    <Input
                      className="pl-11"
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
              <FormLabel>
                {variant === "feedback" ? "Was denkst du?" : "Deine Nachricht"}
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder={
                    variant === "feedback"
                      ? "Ich finde die Ladezeiten super! Aber ..."
                      : "Schreib uns einfach, was du auf dem Herzen hast. Wir hören gerne zu!"
                  }
                  rows={7}
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
              <FormItem className="flex flex-row items-start gap-3 rounded-2xl bg-muted/60 p-3.5">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 text-sm leading-snug">
                  <p>
                    Ich habe die{" "}
                    <a
                      className="font-semibold text-primary underline-offset-4 hover:underline"
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
          <div className="flex items-start gap-3 rounded-2xl bg-rose-soft p-4 text-rose">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />
            <p className="text-sm">{submitError}</p>
          </div>
        ) : null}

        {submitSuccess ? (
          <div className="flex animate-pop-in items-start gap-3 rounded-2xl bg-mint-soft p-4 text-mint">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <p className="font-medium text-sm">{successText}</p>
          </div>
        ) : null}

        <LoadingButton
          className="w-full"
          loading={isSubmitting}
          loadingText="Wird verschickt..."
          size="lg"
          type="submit"
        >
          {variant === "feedback" ? (
            <Sparkles className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
          {variant === "feedback" ? "Feedback abschicken" : "Abschicken"}
        </LoadingButton>
      </form>
    </Form>
  );
}
