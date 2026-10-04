import { Badge } from 'eventual';

export const Variants = () => (
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
    <Badge>Owes you</Badge>
    <Badge variant="secondary">Settled</Badge>
    <Badge variant="outline">Guest</Badge>
    <Badge variant="destructive">Overdue</Badge>
    <Badge variant="ghost">Archived</Badge>
  </div>
);
