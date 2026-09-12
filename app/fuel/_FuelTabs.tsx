import Link from 'next/link';

const TABS = [
  { href: '/fuel', label: 'Today' },
  { href: '/fuel/week', label: 'Week' },
  { href: '/fuel/shopping', label: 'Shopping' },
  { href: '/fuel/prep', label: 'Prep' },
  { href: '/fuel/prefs', label: 'Food I like' },
  { href: '/fuel/foods', label: 'Prices' },
];

export default function FuelTabs({ active }: { active: string }) {
  return (
    <div className="subtabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={t.href === active ? 'on' : ''}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
