import { Input } from 'eventual';
const box = { display: 'flex', flexDirection: 'column' as const, gap: 12, width: 320 };
export const States = () => (
  <div style={box}>
    <Input placeholder="Search expenses" />
    <Input defaultValue="Dinner at Toit" />
    <Input defaultValue="Locked amount" disabled />
    <Input defaultValue="priya@" aria-invalid />
  </div>
);
