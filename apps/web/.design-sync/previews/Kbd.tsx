import { Kbd, KbdGroup } from 'eventual';
export const Shortcuts = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 14 }}>
    <span>Command palette <KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup></span>
    <span>New expense <Kbd>N</Kbd></span>
  </div>
);
