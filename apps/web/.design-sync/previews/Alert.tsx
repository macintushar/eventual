import { Alert, AlertDescription, AlertTitle } from 'eventual';
export const Variants = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 420 }}>
    <Alert><AlertTitle>Heads up</AlertTitle><AlertDescription>Priya hasn't joined yet, so her share stays with the guest.</AlertDescription></Alert>
    <Alert variant="destructive"><AlertTitle>Couldn't save expense</AlertTitle><AlertDescription>The split no longer adds up to the total.</AlertDescription></Alert>
  </div>
);
