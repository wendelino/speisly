/**
 * Erkennt, ob und wie sich Speisly auf dem Gerät als App auf den
 * Homescreen legen lässt (components/install). Nur Handy und Tablet: Am
 * Desktop gibt es keinen Hinweis.
 */
export type InstallPlatformKind =
  | "ios-safari"
  | "ios-chrome"
  | "ios-edge"
  | "ios-firefox"
  /** In-App-Browser oder iOS < 16.4 mit Fremdbrowser: nur Safari kann es */
  | "ios-unsupported"
  | "android-chrome"
  | "android-edge"
  | "android-samsung"
  | "android-firefox"
  | "android-other"
  /** In-App-Browser (WebView): erst im Browser öffnen */
  | "android-unsupported";

export type InstallPlatform = {
  kind: InstallPlatformKind;
  /** iPad: Teilen-Button sitzt oben statt unten */
  tablet: boolean;
};

type DeviceInfo = { userAgent: string; maxTouchPoints: number };

const IN_APP =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview|LinkedInApp|Snapchat|Twitter|Pinterest|GSA\//;
const IOS_DEVICE = /iPhone|iPod|iPad/;
const IOS_VERSION = /OS (\d+)_(\d+)/;
const SAFARI_VERSION = /Version\/(\d+)\.(\d+)/;
const ANDROID_WEBVIEW = /; wv\)/;
/** Andere iOS-Browser, deren UA ebenfalls „Safari“ und „Version/“ enthält */
const IOS_NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPT\/|Ddg\//;
/** Android-Browser ohne eigene Anleitung (Menü unterscheidet sich von Chrome) */
const ANDROID_OTHER = /OPR\/|YaBrowser|UCBrowser|MiuiBrowser/;

/** Ab iOS 16.4 können auch Chrome, Edge und Firefox zum Homescreen hinzufügen */
const IOS_ANY_BROWSER = [16, 4] as const;

function iosVersion(userAgent: string): [number, number] | null {
  const match = IOS_VERSION.exec(userAgent) ?? SAFARI_VERSION.exec(userAgent);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function detectIos(userAgent: string, tablet: boolean): InstallPlatform {
  const platform = (kind: InstallPlatformKind) => ({ kind, tablet });
  if (IN_APP.test(userAgent)) {
    return platform("ios-unsupported");
  }
  const isSafari =
    userAgent.includes("Safari") &&
    userAgent.includes("Version/") &&
    !IOS_NOT_SAFARI.test(userAgent);
  if (isSafari) {
    return platform("ios-safari");
  }
  const version = iosVersion(userAgent);
  const modern =
    version !== null &&
    (version[0] > IOS_ANY_BROWSER[0] ||
      (version[0] === IOS_ANY_BROWSER[0] && version[1] >= IOS_ANY_BROWSER[1]));
  if (!modern) {
    return platform("ios-unsupported");
  }
  if (userAgent.includes("CriOS")) {
    return platform("ios-chrome");
  }
  if (userAgent.includes("EdgiOS")) {
    return platform("ios-edge");
  }
  if (userAgent.includes("FxiOS")) {
    return platform("ios-firefox");
  }
  return platform("ios-unsupported");
}

function detectAndroid(userAgent: string): InstallPlatform {
  const tablet = !userAgent.includes("Mobile");
  const platform = (kind: InstallPlatformKind) => ({ kind, tablet });
  if (IN_APP.test(userAgent) || ANDROID_WEBVIEW.test(userAgent)) {
    return platform("android-unsupported");
  }
  if (userAgent.includes("SamsungBrowser")) {
    return platform("android-samsung");
  }
  if (userAgent.includes("Firefox")) {
    return platform("android-firefox");
  }
  if (userAgent.includes("EdgA")) {
    return platform("android-edge");
  }
  if (ANDROID_OTHER.test(userAgent)) {
    return platform("android-other");
  }
  if (userAgent.includes("Chrome/")) {
    return platform("android-chrome");
  }
  return platform("android-other");
}

/** `null`: Desktop oder unbekannt, dort kein Hinweis */
export function detectInstallPlatform({
  userAgent,
  maxTouchPoints,
}: DeviceInfo): InstallPlatform | null {
  if (IOS_DEVICE.test(userAgent)) {
    return detectIos(userAgent, userAgent.includes("iPad"));
  }
  // iPadOS meldet sich standardmäßig als Mac, hat aber einen Touchscreen
  if (userAgent.includes("Macintosh") && maxTouchPoints > 0) {
    return detectIos(userAgent, true);
  }
  if (userAgent.includes("Android")) {
    return detectAndroid(userAgent);
  }
  return null;
}

/** Läuft Speisly schon als installierte App? (nur im Browser) */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
