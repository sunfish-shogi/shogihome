export type HeadlessModeOperation = {
  operation: "addEngine";
  path: string;
  name: string;
  timeout: number;
  engineOptionsBase64?: string;
};
