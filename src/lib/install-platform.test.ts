import { describe, expect, test } from "bun:test";
import { detectInstallPlatform } from "./install-platform";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
  iphoneChromeOld:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/109.0.5414.112 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15",
  iphoneEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/124.0.2478.89 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.40.92",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0",
  androidEdge:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 EdgA/124.0.2478.64",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  desktopFirefox:
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
};

const detect = (userAgent: string, maxTouchPoints = 5) =>
  detectInstallPlatform({ userAgent, maxTouchPoints });

describe("detectInstallPlatform", () => {
  test("iOS browsers", () => {
    expect(detect(UA.iphoneSafari)).toEqual({
      kind: "ios-safari",
      tablet: false,
    });
    expect(detect(UA.iphoneChrome)?.kind).toBe("ios-chrome");
    expect(detect(UA.iphoneFirefox)?.kind).toBe("ios-firefox");
    expect(detect(UA.iphoneEdge)?.kind).toBe("ios-edge");
  });

  test("iOS without home screen support outside Safari", () => {
    expect(detect(UA.iphoneChromeOld)?.kind).toBe("ios-unsupported");
    expect(detect(UA.iphoneInstagram)?.kind).toBe("ios-unsupported");
  });

  test("iPad with desktop user agent, but not a real Mac", () => {
    expect(detect(UA.ipadDesktop)).toEqual({
      kind: "ios-safari",
      tablet: true,
    });
    expect(detect(UA.ipadDesktop, 0)).toBeNull();
  });

  test("Android browsers", () => {
    expect(detect(UA.androidChrome)).toEqual({
      kind: "android-chrome",
      tablet: false,
    });
    expect(detect(UA.androidTablet)).toEqual({
      kind: "android-chrome",
      tablet: true,
    });
    expect(detect(UA.androidSamsung)?.kind).toBe("android-samsung");
    expect(detect(UA.androidFirefox)?.kind).toBe("android-firefox");
    expect(detect(UA.androidEdge)?.kind).toBe("android-edge");
    expect(detect(UA.androidWebView)?.kind).toBe("android-unsupported");
  });

  test("no hint on desktop", () => {
    expect(detect(UA.desktopChrome, 0)).toBeNull();
    expect(detect(UA.desktopFirefox, 0)).toBeNull();
  });
});
