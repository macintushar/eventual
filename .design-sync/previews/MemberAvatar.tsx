import { MemberAvatar } from 'eventual';
export const Members = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    <MemberAvatar name="Aarav Kapoor" seed="a" /><MemberAvatar name="Priya Sharma" seed="b" />
    <MemberAvatar name="Rohan Mehta" seed="c" /><MemberAvatar name="Isha Nair" seed="d" />
  </div>
);
