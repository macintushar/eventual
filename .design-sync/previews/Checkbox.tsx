import { Checkbox, Label } from 'eventual';
const row = { display: 'flex', alignItems: 'center', gap: 8 };
export const States = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={row}><Checkbox id="c1" defaultChecked /><Label htmlFor="c1">Split equally</Label></div>
    <div style={row}><Checkbox id="c2" /><Label htmlFor="c2">Include Priya</Label></div>
    <div style={row}><Checkbox id="c3" disabled /><Label htmlFor="c3">Archived member</Label></div>
  </div>
);
