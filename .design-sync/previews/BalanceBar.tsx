import { Amount, BalanceBar } from 'eventual';

const rows = [
  { name: 'Aarav', minor: 342000 },
  { name: 'Priya', minor: 120000 },
  { name: 'You', minor: -210000 },
  { name: 'Rohan', minor: -252000 },
];

export const Group = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 380 }}>
    {rows.map((r) => (
      <div key={r.name}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
          <span>{r.name}</span>
          <Amount minor={r.minor} tone="signed" />
        </div>
        <BalanceBar minor={r.minor} max={342000} label={r.name} />
      </div>
    ))}
  </div>
);
