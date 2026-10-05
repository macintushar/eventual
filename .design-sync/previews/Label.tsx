import { Input, Label } from 'eventual';
export const WithInput = () => (
  <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
    <Label htmlFor="l-name">Group name</Label>
    <Input id="l-name" defaultValue="Goa trip" />
  </div>
);
