import { Skeleton } from 'eventual';
export const Row = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Skeleton style={{ width: 40, height: 40, borderRadius: 999 }} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Skeleton style={{ width: 200, height: 14 }} /><Skeleton style={{ width: 140, height: 14 }} />
    </div>
  </div>
);
