import { Button } from 'eventual';

export const Variants = () => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
    <Button>Add expense</Button>
    <Button variant="secondary">Settle up</Button>
    <Button variant="outline">Invite friend</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="destructive">Delete group</Button>
    <Button variant="link">View activity</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Button size="xs">Extra small</Button>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const Disabled = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    <Button disabled>Save changes</Button>
    <Button variant="outline" disabled>Remind</Button>
  </div>
);
