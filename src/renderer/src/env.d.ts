/// <reference types="vite/client" />
/// <reference path="../../preload/index.d.ts" />

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        allowpopups?: string | boolean;
      };
    }
  }
}
