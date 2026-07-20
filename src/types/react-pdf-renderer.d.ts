/**
 * Shim de tipos TEMPORÁRIO para `@react-pdf/renderer` (Spec 12).
 *
 * A dependência foi adicionada ao bloco `dependencies` do `package.json`
 * (`"@react-pdf/renderer": "^4.3.0"`) mas a instalação é feita pelo
 * ORQUESTRADOR (instrução: não correr `pnpm install` no worktree). Este shim
 * cobre exactamente a superfície usada em `src/lib/documents/pdf/*` para o
 * `pnpm check` ficar verde entretanto.
 *
 * ⚠️ APAGAR este ficheiro após `pnpm install` — o pacote traz os tipos reais
 * (esta declaração ambiente sombreia-os enquanto existir).
 */
declare module '@react-pdf/renderer' {
  import type * as React from 'react';

  export type Style = Record<string, unknown>;

  export interface DocumentProps {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    children?: React.ReactNode;
  }

  export interface PageProps {
    size?: string | [number, number];
    style?: Style | Style[];
    wrap?: boolean;
    children?: React.ReactNode;
  }

  export interface ViewProps {
    style?: Style | Style[];
    wrap?: boolean;
    fixed?: boolean;
    children?: React.ReactNode;
  }

  export interface TextProps {
    style?: Style | Style[];
    wrap?: boolean;
    fixed?: boolean;
    render?: (props: { pageNumber: number; totalPages: number }) => React.ReactNode;
    children?: React.ReactNode;
  }

  export const Document: React.FC<DocumentProps>;
  export const Page: React.FC<PageProps>;
  export const View: React.FC<ViewProps>;
  export const Text: React.FC<TextProps>;

  export const StyleSheet: {
    create<T extends Record<string, Style>>(styles: T): T;
  };

  export function renderToBuffer(element: React.ReactElement): Promise<Buffer>;
  export function renderToStream(element: React.ReactElement): Promise<NodeJS.ReadableStream>;
}
