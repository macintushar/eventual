import { Input, SettingsRow, Switch } from 'eventual';
export const Rows = () => (
  <div style={{ width: 480 }}>
    <SettingsRow title="Dark mode" description="Follows your system by default." htmlFor="sr1"><Switch id="sr1" /></SettingsRow>
    <SettingsRow title="Display name" layout="stacked" htmlFor="sr2"><Input id="sr2" defaultValue="Tushar" /></SettingsRow>
  </div>
);
