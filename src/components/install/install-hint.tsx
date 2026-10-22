import {
  Copy,
  Ellipsis,
  EllipsisVertical,
  type LucideIcon,
  Menu,
  Share,
  Smartphone,
  SquarePlus,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { markInstalled } from "@/lib/install-hint";
import type { InstallPlatform } from "@/lib/install-platform";
import { clearInstallPrompt, takeInstallPrompt } from "@/lib/install-prompt";

type InstallHintProps = {
  open: boolean;
  platform: InstallPlatform;
  /** `installed`: über den nativen Dialog installiert */
  onClose: (installed: boolean) => void;
};

/** Beschriftung eines Browser-Buttons, wie er auf dem Gerät aussieht */
function Key({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-muted px-1.5 py-0.5 align-middle font-semibold text-foreground text-xs">
      {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : null}
      {children}
    </span>
  );
}

const ADD_HOME = <Key icon={SquarePlus}>Zum Home-Bildschirm</Key>;
const ADD = <Key>Hinzufügen</Key>;

/** Chrome und Edge auf Android: gleiche Schritte, Menü an anderer Stelle */
function chromiumSteps(where: string, menu: LucideIcon): ReactNode[] {
  return [
    <>
      Tippe {where} auf <Key icon={menu} />.
    </>,
    <>
      Wähle <Key>App installieren</Key> oder{" "}
      <Key>Zum Startbildschirm hinzufügen</Key>.
    </>,
    <>
      Bestätige mit <Key>Installieren</Key> – fertig!
    </>,
  ];
}

/** Schritte je Browser; `null`: nur im anderen Browser möglich */
function steps({ kind, tablet }: InstallPlatform): ReactNode[] | null {
  switch (kind) {
    case "ios-safari":
      return [
        tablet ? (
          <>
            Tippe oben rechts neben der Adresszeile auf{" "}
            <Key icon={Share}>Teilen</Key>.
          </>
        ) : (
          <>
            Tippe unten auf <Key icon={Share}>Teilen</Key> (ab iOS 26 erst auf{" "}
            <Key icon={Ellipsis} />
            ).
          </>
        ),
        <>Scrolle etwas nach unten und wähle {ADD_HOME}.</>,
        <>Tippe oben rechts auf {ADD} – fertig!</>,
      ];
    case "ios-chrome":
      return [
        <>
          Tippe oben rechts in der Adresszeile auf{" "}
          <Key icon={Share}>Teilen</Key>.
        </>,
        <>Wähle {ADD_HOME}.</>,
        <>Tippe auf {ADD} – fertig!</>,
      ];
    case "ios-edge":
      return [
        <>
          Tippe unten auf <Key icon={Ellipsis} /> und dann auf{" "}
          <Key icon={Share}>Teilen</Key>.
        </>,
        <>Wähle {ADD_HOME}.</>,
        <>Tippe auf {ADD} – fertig!</>,
      ];
    case "ios-firefox":
      return [
        <>
          Tippe unten rechts auf <Key icon={Menu} /> und dann auf{" "}
          <Key icon={Share}>Teilen</Key>.
        </>,
        <>Wähle {ADD_HOME}.</>,
        <>Tippe auf {ADD} – fertig!</>,
      ];
    case "android-chrome":
      return chromiumSteps("oben rechts", EllipsisVertical);
    case "android-edge":
      return chromiumSteps("unten", Ellipsis);
    case "android-samsung":
      return [
        <>
          Tippe unten rechts auf <Key icon={Menu} />.
        </>,
        <>
          Wähle <Key>Seite hinzufügen zu</Key> und dann{" "}
          <Key>Startbildschirm</Key>.
        </>,
        <>
          Tippe auf <Key>Hinzufügen</Key> – fertig!
        </>,
      ];
    case "android-firefox":
      return [
        <>
          Tippe auf <Key icon={EllipsisVertical} />.
        </>,
        <>
          Wähle <Key>Installieren</Key> oder{" "}
          <Key>Zum Startbildschirm hinzufügen</Key>.
        </>,
        <>
          Bestätige mit <Key>Hinzufügen</Key> – fertig!
        </>,
      ];
    case "android-other":
      return [
        <>Öffne das Menü deines Browsers.</>,
        <>
          Wähle <Key>Zum Startbildschirm hinzufügen</Key> oder{" "}
          <Key>App installieren</Key>.
        </>,
        <>Bestätige – fertig!</>,
      ];
    default:
      return null;
  }
}

function StepList({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
        <li className="flex gap-3 text-sm leading-relaxed" key={index}>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
            {index + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** In-App-Browser & Co.: Link kopieren und im richtigen Browser öffnen */
function OpenElsewhere({ browser }: { browser: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.origin);
      setCopied(true);
    } catch {
      // Zwischenablage gesperrt: Adresse steht ja im Text
    }
  };
  return (
    <div className="space-y-4 pb-1 text-sm leading-relaxed">
      <p>
        In diesem Browser klappt das leider nicht. Öffne{" "}
        <strong>{location.host}</strong> in {browser} – dort zeigen wir dir, wie
        es geht.
      </p>
      <Button className="w-full" onClick={copy} variant="outline">
        <Copy />
        {copied ? "Link kopiert!" : "Link kopieren"}
      </Button>
    </div>
  );
}

export function InstallHint({ open, platform, onClose }: InstallHintProps) {
  // Nativer Dialog (Chrome, Edge, Samsung auf Android), falls angeboten
  const [nativePrompt] = useState(takeInstallPrompt);
  const items = steps(platform);

  const install = async () => {
    if (!nativePrompt) {
      return;
    }
    clearInstallPrompt();
    await nativePrompt.prompt();
    const { outcome } = await nativePrompt.userChoice;
    if (outcome === "accepted") {
      markInstalled();
    }
    onClose(outcome === "accepted");
  };

  let body: ReactNode;
  if (nativePrompt) {
    body = (
      <p className="text-sm leading-relaxed">
        Ein Tipp genügt – Speisly landet als App auf deinem Startbildschirm.
      </p>
    );
  } else if (items) {
    body = <StepList items={items} />;
  } else {
    body = (
      <OpenElsewhere
        browser={platform.kind === "ios-unsupported" ? "Safari" : "Chrome"}
      />
    );
  }

  return (
    <Drawer
      onOpenChange={(next) => {
        if (!next) {
          onClose(false);
        }
      }}
      open={open}
    >
      <DrawerContent>
        <DrawerHeader className="items-center gap-3 pr-0 text-center">
          <div className="-rotate-6 inline-flex size-20 animate-float items-center justify-center rounded-blob bg-sky-soft text-sky">
            <Smartphone className="size-10" />
          </div>
          <DrawerTitle className="text-2xl">Speisly als App</DrawerTitle>
          <DrawerDescription className="leading-relaxed">
            Leg Speisly auf deinen{" "}
            {platform.kind.startsWith("ios")
              ? "Home-Bildschirm"
              : "Startbildschirm"}{" "}
            – dann ist der Speiseplan mit einem Tipp da, im Vollbild wie eine
            echte App.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>{body}</DrawerBody>
        <DrawerFooter className={nativePrompt ? "flex-row" : ""}>
          {nativePrompt ? (
            <>
              <Button
                className="flex-1"
                onClick={() => onClose(false)}
                variant="outline"
              >
                Später
              </Button>
              <Button className="flex-1" onClick={install}>
                Installieren
              </Button>
            </>
          ) : (
            <Button onClick={() => onClose(false)} variant="outline">
              {items ? "Verstanden" : "Später"}
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
