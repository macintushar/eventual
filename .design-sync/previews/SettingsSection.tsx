import { Button, SettingsRow, SettingsSection, Switch } from 'eventual';
export const Profile = () => (
  <div style={{ width: 480 }}>
    <SettingsSection title="Notifications" description="Choose what lands in your inbox.">
      <SettingsRow title="Weekly summary" description="Every Monday morning." htmlFor="ss1"><Switch id="ss1" defaultChecked /></SettingsRow>
      <SettingsRow title="Payment reminders" htmlFor="ss2"><Switch id="ss2" /></SettingsRow>
    </SettingsSection>
  </div>
);
export const Danger = () => (
  <div style={{ width: 480 }}>
    <SettingsSection title="Danger zone" description="These actions can't be undone." tone="danger">
      <SettingsRow title="Delete account" description="Removes your data from every group."><Button variant="destructive" size="sm">Delete</Button></SettingsRow>
    </SettingsSection>
  </div>
);
