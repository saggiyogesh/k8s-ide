import type { PropsWithChildren, ReactNode } from 'react';

type ExplorerLayoutProps = PropsWithChildren<{
  sidebar: ReactNode;
  header?: ReactNode;
  detail?: ReactNode;
  isMobile?: boolean;
}>;

export function ExplorerLayout({
  sidebar,
  header,
  detail,
  isMobile,
  children,
}: ExplorerLayoutProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#030712',
        color: '#f9fafb',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
      }}
    >
      <header
        style={{
          borderBottom: '1px solid #1f2937',
          padding: 16,
          display: 'grid',
          gap: 12,
        }}
      >
        {header}
      </header>

      <main
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '260px 1fr minmax(280px, 360px)',
          gap: 1,
          background: '#111827',
        }}
      >
        <aside style={panelStyle}>{sidebar}</aside>
        <section style={panelStyle}>{children}</section>
        {!isMobile ? <aside style={panelStyle}>{detail}</aside> : null}
      </main>

      {isMobile && detail ? (
        <section style={{ ...panelStyle, borderTop: '1px solid #1f2937' }}>{detail}</section>
      ) : null}
    </div>
  );
}

const panelStyle = {
  background: '#030712',
  padding: 16,
  overflow: 'auto',
};
