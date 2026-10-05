import { Textarea } from 'eventual';
export const Notes = () => (
  <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <Textarea placeholder="Add a note for the group" />
    <Textarea defaultValue={'Booked via Airbnb.\nCleaning fee included in the total.'} />
  </div>
);
