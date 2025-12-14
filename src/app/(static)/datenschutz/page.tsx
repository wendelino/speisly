import type { Metadata } from "next";
import Link from "next/link";
import Title from "@/components/title";
import { CookiePreferencesButton } from "@/lib/cookie/cookie-preferences-button";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description: "Datenschutzerklärung für Speisly",
};

export const dynamic = "force-static";

export default function DatenschutzPage() {
  return (
    <div>
      <div className="mb-8">
        <Title noBorder variant="h1">
          Datenschutzerklärung
        </Title>
        <p className="text-muted-foreground">
          Stand:{" "}
          {new Date().toLocaleDateString("de-DE", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="prose prose-slate max-w-none space-y-8">
        <section>
          <Title noBorder variant="h2">
            1. Verantwortlicher
          </Title>
          <p className="mb-4">
            Verantwortlich für die Datenverarbeitung auf dieser Website ist:
          </p>
          <p className="mb-4 font-semibold">Speisly</p>
          <p className="text-muted-foreground text-sm">
            Bei Fragen zum Datenschutz können Sie uns jederzeit über unser{" "}
            <Link
              className="text-primary underline hover:text-primary/80"
              href="/kontakt"
            >
              Kontaktformular
            </Link>{" "}
            erreichen.
          </p>
        </section>

        <section>
          <Title noBorder variant="h2">
            2. Allgemeine Hinweise zur Datenverarbeitung
          </Title>
          <p className="mb-4">
            Diese Datenschutzerklärung informiert Sie über die Art, den Umfang
            und Zweck der Verarbeitung von personenbezogenen Daten auf unserer
            Website Speisly. Speisly ist eine Anwendung zur Anzeige von
            Speiseplänen der Mensen der Martin-Luther-Universität
            Halle-Wittenberg.
          </p>
          <p>
            Personenbezogene Daten sind alle Daten, die auf Sie als natürliche
            Person beziehbar sind und durch die Sie direkt oder indirekt
            identifiziert werden können.
          </p>
        </section>

        <section>
          <Title noBorder variant="h2">
            3. Cookies
          </Title>
          <p className="mb-6">
            Unsere Website verwendet Cookies. Cookies sind kleine Textdateien,
            die auf Ihrem Endgerät gespeichert werden und bestimmte
            Informationen enthalten. Wir unterscheiden zwischen technisch
            notwendigen Cookies und Cookies, die eine Einwilligung erfordern.
          </p>

          <div className="space-y-6">
            <div>
              <Title noBorder variant="h3">
                3.1 Technisch notwendige Cookies
              </Title>
              <p className="mb-4">
                Diese Cookies sind für die Grundfunktionen der Website
                erforderlich und können nicht deaktiviert werden. Sie werden in
                der Regel nur als Reaktion auf von Ihnen durchgeführte Aktionen
                gesetzt, die einer Anfrage nach Diensten gleichkommen (z. B. das
                Setzen Ihrer Datenschutzeinstellungen, das Anmelden oder das
                Ausfüllen von Formularen).
              </p>
              <div className="space-y-4">
                <div>
                  <Title noBorder variant="h4">
                    Filter-Präferenzen (Essenspräferenzen)
                  </Title>
                  <ul className="ml-4 list-inside list-disc space-y-1 text-sm">
                    <li>
                      <strong>Cookie-Name:</strong> speisly_mensa_preferences
                    </li>
                    <li>
                      <strong>Zweck:</strong> Speicherung Ihrer ausgewählten
                      Mensen-Präferenzen
                    </li>
                    <li>
                      <strong>Speicherdauer:</strong> 365 Tage
                    </li>
                    <li>
                      <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f
                      DSGVO (berechtigtes Interesse an der Funktionsfähigkeit
                      der Website)
                    </li>
                  </ul>
                </div>
                <div>
                  <Title noBorder variant="h4">
                    Vegetarischer Filter
                  </Title>
                  <ul className="ml-4 list-inside list-disc space-y-1 text-sm">
                    <li>
                      <strong>Cookie-Name:</strong> speisly_veggie_filter
                    </li>
                    <li>
                      <strong>Zweck:</strong> Speicherung Ihrer Einstellung für
                      vegetarische Gerichte
                    </li>
                    <li>
                      <strong>Speicherdauer:</strong> 365 Tage
                    </li>
                    <li>
                      <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f
                      DSGVO (berechtigtes Interesse an der Funktionsfähigkeit
                      der Website)
                    </li>
                  </ul>
                </div>
                <div>
                  <Title noBorder variant="h4">
                    Veganer Filter
                  </Title>
                  <ul className="ml-4 list-inside list-disc space-y-1 text-sm">
                    <li>
                      <strong>Cookie-Name:</strong> speisly_vegan_filter
                    </li>
                    <li>
                      <strong>Zweck:</strong> Speicherung Ihrer Einstellung für
                      vegane Gerichte
                    </li>
                    <li>
                      <strong>Speicherdauer:</strong> 365 Tage
                    </li>
                    <li>
                      <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f
                      DSGVO (berechtigtes Interesse an der Funktionsfähigkeit
                      der Website)
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <Title noBorder variant="h3">
                3.2 Cookies mit Einwilligung
              </Title>
              <p className="mb-4">
                Diese Cookies erfordern Ihre ausdrückliche Einwilligung und
                werden nur gesetzt, wenn Sie dieser zugestimmt haben.
              </p>
              <div className="space-y-4">
                <div>
                  <Title noBorder variant="h4">
                    User-ID Cookie (Bewertungssystem)
                  </Title>
                  <ul className="ml-4 list-inside list-disc space-y-1 text-sm">
                    <li>
                      <strong>Cookie-Name:</strong> speisly_user_id
                    </li>
                    <li>
                      <strong>Zweck:</strong> Identifikation von Nutzern für das
                      Bewertungssystem von Gerichten, um sicherzustellen, dass
                      jeder Nutzer nur einmal pro Gericht bewerten kann
                    </li>
                    <li>
                      <strong>Speicherdauer:</strong> 365 Tage
                    </li>
                    <li>
                      <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. a
                      DSGVO (Einwilligung)
                    </li>
                    <li>
                      <strong>Hinweis:</strong> Dieses Cookie wird nur gesetzt,
                      wenn Sie der Verwendung von Cookies zugestimmt haben. Sie
                      können Ihre Einwilligung jederzeit widerrufen.
                    </li>
                  </ul>
                </div>
                <div>
                  <Title noBorder variant="h4">
                    Cookie-Einwilligung
                  </Title>
                  <ul className="ml-4 list-inside list-disc space-y-1 text-sm">
                    <li>
                      <strong>Cookie-Name:</strong> speisly_consent
                    </li>
                    <li>
                      <strong>Zweck:</strong> Speicherung Ihrer
                      Cookie-Einwilligungseinstellung
                    </li>
                    <li>
                      <strong>Speicherdauer:</strong> 365 Tage
                    </li>
                    <li>
                      <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f
                      DSGVO (berechtigtes Interesse an der Nachweisbarkeit der
                      Einwilligung)
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <Title noBorder variant="h3">
                3.3 Verwaltung von Cookies
              </Title>
              <p className="mb-4">
                Sie können Ihre Cookie-Einstellungen jederzeit über den
                Cookie-Banner ändern oder Cookies in den Einstellungen deines
                Browsers löschen. Bitte beachten Sie, dass das Löschen von
                technisch notwendigen Cookies die Funktionalität der Website
                beeinträchtigen kann.
              </p>
              <CookiePreferencesButton />
            </div>
          </div>
        </section>

        <section>
          <Title noBorder variant="h2">
            4. Verarbeitung von IP-Adressen
          </Title>
          <p className="mb-4">
            Bei jedem Zugriff auf unsere Website werden IP-Adressen automatisch
            erfasst. Um Ihre Privatsphäre zu schützen, werden IP-Adressen nicht
            im Klartext gespeichert, sondern mittels SHA-256-Hashfunktion
            verschlüsselt (gehasht).
          </p>
          <div className="mb-4 space-y-2">
            <Title noBorder variant="h4">
              Details zur IP-Adress-Verarbeitung:
            </Title>
            <ul className="ml-4 list-inside list-disc space-y-1 text-sm">
              <li>
                <strong>Verarbeitung:</strong> IP-Adressen werden beim
                Serverzugriff automatisch erfasst
              </li>
              <li>
                <strong>Verschlüsselung:</strong> SHA-256 Hashfunktion
                (einwegverschlüsselt, nicht rückführbar)
              </li>
              <li>
                <strong>Speicherung:</strong> Nur der Hash-Wert wird in der
                Datenbank gespeichert, nicht die ursprüngliche IP-Adresse
              </li>
              <li>
                <strong>Zweck:</strong> Identifikation von Nutzern für das
                Bewertungssystem (in Kombination mit Cookie-Hash) und
                Sicherstellung der Funktionsfähigkeit der Website
              </li>
              <li>
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO
                (berechtigtes Interesse an der Funktionsfähigkeit und Sicherheit
                der Website)
              </li>
              <li>
                <strong>Speicherdauer:</strong> Die gehashten IP-Adressen werden
                solange gespeichert, wie sie für die genannten Zwecke
                erforderlich sind
              </li>
            </ul>
          </div>
          <p className="text-muted-foreground text-sm">
            Durch die Verwendung von Hash-Funktionen können IP-Adressen nicht
            mehr direkt identifiziert werden. Dies stellt einen zusätzlichen
            Schutz Ihrer Privatsphäre dar.
          </p>
        </section>

        <section>
          <Title noBorder variant="h2">
            5. Bewertungssystem
          </Title>
          <p className="mb-4">
            Wenn Sie Gerichte bewerten möchten, verwenden wir eine Kombination
            aus gehashten IP-Adressen und Cookie-Hashes, um sicherzustellen,
            dass jeder Nutzer nur einmal pro Gericht bewerten kann.
          </p>
          <div className="mb-4 space-y-2">
            <Title noBorder variant="h4">
              Verarbeitete Daten:
            </Title>
            <ul className="ml-4 list-inside list-disc space-y-1 text-sm">
              <li>Gehashte IP-Adresse (SHA-256)</li>
              <li>Gehashte Cookie-ID (SHA-256) - nur bei Einwilligung</li>
              <li>Bewertungsdaten (Sternebewertung, optional Kommentar)</li>
              <li>Zeitstempel der Bewertung</li>
            </ul>
          </div>
          <p>
            <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. a DSGVO
            (Einwilligung) für die Verwendung von Cookies, Art. 6 Abs. 1 lit. f
            DSGVO (berechtigtes Interesse) für die Verarbeitung von gehashten
            IP-Adressen.
          </p>
        </section>

        <section>
          <Title noBorder variant="h2">
            6. Ihre Rechte
          </Title>
          <p className="mb-4">
            Sie haben nach der DSGVO verschiedene Rechte bezüglich Ihrer
            personenbezogenen Daten:
          </p>
          <div className="space-y-4">
            <div>
              <Title noBorder variant="h4">
                Recht auf Auskunft (Art. 15 DSGVO)
              </Title>
              <p className="text-muted-foreground text-sm">
                Sie haben das Recht, Auskunft über die von uns gespeicherten
                personenbezogenen Daten zu erhalten.
              </p>
            </div>
            <div>
              <Title noBorder variant="h4">
                Recht auf Berichtigung (Art. 16 DSGVO)
              </Title>
              <p className="text-muted-foreground text-sm">
                Sie haben das Recht, die Berichtigung unrichtiger oder die
                Vervollständigung unvollständiger Daten zu verlangen.
              </p>
            </div>
            <div>
              <Title noBorder variant="h4">
                Recht auf Löschung (Art. 17 DSGVO)
              </Title>
              <p className="text-muted-foreground text-sm">
                Sie haben das Recht, die Löschung Ihrer personenbezogenen Daten
                zu verlangen, sofern keine gesetzlichen Aufbewahrungspflichten
                bestehen.
              </p>
            </div>
            <div>
              <Title noBorder variant="h4">
                Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)
              </Title>
              <p className="text-muted-foreground text-sm">
                Sie haben das Recht, die Einschränkung der Verarbeitung Ihrer
                personenbezogenen Daten zu verlangen.
              </p>
            </div>
            <div>
              <Title noBorder variant="h4">
                Recht auf Datenübertragbarkeit (Art. 20 DSGVO)
              </Title>
              <p className="text-muted-foreground text-sm">
                Sie haben das Recht, Ihre personenbezogenen Daten in einem
                strukturierten, gängigen und maschinenlesbaren Format zu
                erhalten.
              </p>
            </div>
            <div>
              <Title noBorder variant="h4">
                Widerspruchsrecht (Art. 21 DSGVO)
              </Title>
              <p className="text-muted-foreground text-sm">
                Sie haben das Recht, der Verarbeitung Ihrer personenbezogenen
                Daten zu widersprechen, wenn die Verarbeitung auf Art. 6 Abs. 1
                lit. f DSGVO (berechtigtes Interesse) beruht.
              </p>
            </div>
            <div>
              <Title noBorder variant="h4">
                Widerruf der Einwilligung (Art. 7 Abs. 3 DSGVO)
              </Title>
              <p className="text-muted-foreground text-sm">
                Sie haben das Recht, Ihre erteilte Einwilligung jederzeit zu
                widerrufen. Die Rechtmäßigkeit der aufgrund der Einwilligung bis
                zum Widerruf erfolgten Verarbeitung wird dadurch nicht berührt.
              </p>
            </div>
            <div>
              <Title noBorder variant="h4">
                Beschwerderecht (Art. 77 DSGVO)
              </Title>
              <p className="text-muted-foreground text-sm">
                Sie haben das Recht, sich bei einer Aufsichtsbehörde zu
                beschweren, wenn Sie der Ansicht sind, dass die Verarbeitung
                Ihrer personenbezogenen Daten gegen die DSGVO verstößt.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <Title noBorder variant="h4">
              Kontakt für Auskünfte:
            </Title>
            <p className="text-sm">
              Um Ihre Rechte auszuüben, wenden Sie sich bitte an den
              Verantwortlichen (siehe Abschnitt 1). Bitte geben Sie bei Ihrer
              Anfrage an, welche Daten betroffen sind und welche Rechte Sie
              ausüben möchten.
            </p>
          </div>
        </section>

        <section>
          <Title noBorder variant="h2">
            7. Datensicherheit
          </Title>
          <p className="mb-4">
            Wir setzen technische und organisatorische Maßnahmen ein, um Ihre
            personenbezogenen Daten vor Verlust, Zerstörung, Manipulation oder
            unbefugtem Zugriff zu schützen. Dazu gehören:
          </p>
          <ul className="ml-4 list-inside list-disc space-y-2 text-sm">
            <li>
              Verschlüsselung von IP-Adressen mittels SHA-256 Hashfunktion
            </li>
            <li>
              Verschlüsselung von Cookie-Werten mittels SHA-256 Hashfunktion
            </li>
            <li>Verwendung von sicheren Verbindungen (HTTPS)</li>
            <li>Regelmäßige Sicherheitsüberprüfungen</li>
            <li>Zugriffskontrollen auf die Datenbank</li>
          </ul>
        </section>

        <section>
          <Title noBorder variant="h2">
            8. Speicherdauer
          </Title>
          <p className="mb-4">
            Wir speichern personenbezogene Daten nur so lange, wie es für die
            jeweiligen Zwecke erforderlich ist oder gesetzliche
            Aufbewahrungspflichten bestehen. Im Einzelnen:
          </p>
          <ul className="ml-4 list-inside list-disc space-y-2 text-sm">
            <li>
              <strong>Cookies:</strong> Maximal 365 Tage, danach werden sie
              automatisch gelöscht
            </li>
            <li>
              <strong>Gehashte IP-Adressen:</strong> Solange sie für die
              Funktionsfähigkeit des Bewertungssystems erforderlich sind
            </li>
            <li>
              <strong>Bewertungsdaten:</strong> Unbegrenzt, solange keine
              Löschung beantragt wird
            </li>
          </ul>
          <p className="mt-4 text-muted-foreground text-sm">
            Sie können jederzeit die Löschung Ihrer Daten verlangen (siehe
            Abschnitt 6).
          </p>
        </section>

        <section>
          <Title noBorder variant="h2">
            9. Weitergabe von Daten
          </Title>
          <p className="mb-4">
            Wir geben Ihre personenbezogenen Daten grundsätzlich nicht an Dritte
            weiter. Ausnahmen bestehen nur:
          </p>
          <ul className="ml-4 list-inside list-disc space-y-2 text-sm">
            <li>
              wenn Sie ausdrücklich eingewilligt haben (Art. 6 Abs. 1 lit. a
              DSGVO)
            </li>
            <li>
              wenn die Weitergabe zur Erfüllung einer rechtlichen Verpflichtung
              erforderlich ist (Art. 6 Abs. 1 lit. c DSGVO)
            </li>
            <li>
              wenn die Weitergabe zur Geltendmachung, Ausübung oder Verteidigung
              von Rechtsansprüchen erforderlich ist (Art. 6 Abs. 1 lit. f DSGVO)
            </li>
          </ul>
          <p className="mt-4">
            <strong>Hinweis:</strong> Wir nutzen Hosting-Dienste, die
            personenbezogene Daten im Auftrag verarbeiten können. Diese
            Dienstleister sind vertraglich verpflichtet, die Daten nur im Rahmen
            unserer Weisungen zu verarbeiten und die Datenschutzbestimmungen
            einzuhalten.
          </p>
        </section>

        <section>
          <Title noBorder variant="h2">
            10. Änderungen dieser Datenschutzerklärung
          </Title>
          <p>
            Wir behalten uns vor, diese Datenschutzerklärung anzupassen, damit
            sie stets den aktuellen rechtlichen Anforderungen entspricht oder um
            Änderungen unserer Leistungen in der Datenschutzerklärung
            umzusetzen. Für Ihren erneuten Besuch gilt dann die neue
            Datenschutzerklärung.
          </p>
        </section>
      </div>
    </div>
  );
}
