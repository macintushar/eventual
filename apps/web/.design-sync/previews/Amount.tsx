import { Amount } from 'eventual';
export const Tones = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 18 }}>
    <Amount minor={248000} />
    <Amount minor={342000} tone="signed" />
    <Amount minor={-125050} tone="signed" />
    <Amount minor={1999} currency="USD" />
  </div>
);
