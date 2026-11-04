import './globals.css';

export const metadata = {
  title: 'Weihnachtsstand & Döner Bestellsystem',
  description: 'Direkt bestellen & frisch geniessen',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
