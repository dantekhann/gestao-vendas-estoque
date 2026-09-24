import './globals.css';

export const metadata = {
  title: 'OrC Brasil - Gestão de Vendas e Estoque',
  description: 'Sistema de gestão integrado para OrC Brasil',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}