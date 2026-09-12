import Link from 'next/link';

const TABS = [
  { href: '/', label: 'Today' },
  { href: '/week', label: 'Week' },
  { href: '/fuel', label: 'Fuel' },
  { href: '/log', label: 'Log' },
  { href: '/reference', label: 'More' },
];

export default function Nav({ active }: { active: string }) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={t.href === active ? 'on' : ''}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
