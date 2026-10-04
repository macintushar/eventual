import { Button, Spinner } from 'eventual';
export const Inline = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <Spinner />
    <Button disabled><Spinner /> Saving…</Button>
  </div>
);
