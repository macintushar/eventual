import { Label, Switch } from 'eventual';
const row = { display: 'flex', alignItems: 'center', gap: 10 };
export const States = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={row}><Switch id="s1" defaultChecked /><Label htmlFor="s1">Weekly reminders</Label></div>
    <div style={row}><Switch id="s2" /><Label htmlFor="s2">Recurring expense</Label></div>
    <div style={row}><Switch id="s3" disabled /><Label htmlFor="s3">Email digest</Label></div>
  </div>
);
