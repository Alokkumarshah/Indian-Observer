import Link from 'next/link';
import './globals.css';

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'India', href: '/?section=india' },
  { label: 'World', href: '/?section=world' },
  { label: 'Cities', href: '/?section=cities' },
  { label: 'Opinion', href: '/?section=opinion' },
  { label: 'Sports', href: '/?section=sports' },
  { label: 'Tech', href: '/?section=tech' },
];

const tickerHeadlines = [
  'Markets steady ahead of budget announcement',
  'Supreme Court to hear data privacy plea',
  'Monsoon deficit narrows after late rains',
  'Startup IPO pipeline heats up for Q1',
  'National chess teen clinches world title',
];

export const metadata = {
  title: 'The Indian Observer',
  description: 'Old-school credibility, modern urgency.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="observer-body">
        <header className="observer-header">
          <div className="observer-top-row">
            <div className="observer-logo-lockup">
              <Link href="/" className="observer-logo" aria-label="The Indian Observer">
                The Indian Observer
              </Link>
              <span className="observer-tagline">Unbiased. Unbroken.</span>
            </div>
            <div className="observer-actions">
              <button type="button" className="observer-action">Search</button>
              <Link className="observer-action" href="/epaper">E-Paper</Link>
              <Link className="observer-action" href="/admin/login">Sign In</Link>
            </div>
          </div>

          <div className="observer-nav-row">
            <span className="observer-io-badge">IO+</span>
            <nav className="observer-nav-links">
              {navLinks.map((link) => (
                <Link key={link.label} href={link.href}>
                  {link.label.toUpperCase()}
                </Link>
              ))}
            </nav>
            <div className="observer-nav-gap" />
          </div>

          <div className="observer-ticker">
            <span className="observer-ticker-label">OBSERVER TRENDS</span>
            <div className="observer-ticker-marquee">
              <div className="observer-ticker-track">
                {tickerHeadlines.map((headline) => (
                  <span key={headline}>{headline}</span>
                ))}
              </div>
            </div>
          </div>
        </header>

        <main className="observer-shell">{children}</main>
      </body>
    </html>
  );
}
