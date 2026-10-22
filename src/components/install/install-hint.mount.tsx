import { mountOnce } from "@/components/on-demand";
import { markInstallHintDismissed } from "@/lib/install-hint";
import type { InstallPlatform } from "@/lib/install-platform";
import { $installHintOpen } from "@/stores/ui";
import { useAtom } from "@/stores/use-atom";
import { InstallHint } from "./install-hint";

function InstallHintRoot({ platform }: { platform: InstallPlatform }) {
  const open = useAtom($installHintOpen);
  return (
    <InstallHint
      onClose={(installed) => {
        if (!installed) {
          markInstallHintDismissed();
        }
        $installHintOpen.set(false);
      }}
      open={open}
      platform={platform}
    />
  );
}

export function openInstallHint(platform: InstallPlatform): void {
  mountOnce("install-hint", () => <InstallHintRoot platform={platform} />);
  $installHintOpen.set(true);
}
