/** Puter.js loads from https://js.puter.com/v2/ and attaches `window.puter`. */
export {};

declare global {
  interface Window {
    puter?: {
      ai?: {
        txt2speech?: (
          text: string,
          testModeOrOptions?: boolean | Record<string, unknown>,
        ) => Promise<HTMLAudioElement>;
      };
    };
  }
}
