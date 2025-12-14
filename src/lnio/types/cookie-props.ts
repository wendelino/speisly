export type CookieProps = {
  key: string;
  value: string;
};
export type ConsentCookieData = {
  accepted: boolean;
  timestamp: string;
};
export type SetCookieProps = CookieProps & { days?: number };
