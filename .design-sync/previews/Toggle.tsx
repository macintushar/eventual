import { Toggle } from 'eventual';
export const States = () => (
  <div style={{ display: 'flex', gap: 10 }}>
    <Toggle>Pinned</Toggle><Toggle defaultPressed>Archived</Toggle><Toggle variant="outline">Unsettled</Toggle>
  </div>
);
